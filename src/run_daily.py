"""Every day on GitHub: make the 2 videos of the day from plan/topic_plan.json and schedule them on Zernio.

A programme day D holds two slots (Paris time): 21:00 on D, and 02:00 on D+1, each moved by up to
post_time_jitter_minutes (config.json) like the other channels.
Each topic needs its data file, data/topics/<id>.json, written and checked in advance by the weekly routine.
A missing or broken data file never leaves a slot empty: a backup marble tournament goes out instead.

Usage:
    python src/run_daily.py                    # today's programme day: make + schedule (PUBLIC at the slot time)
    python src/run_daily.py --no-publish       # only make the videos (test)
    python src/run_daily.py --dry-run          # make + show what would be sent to Zernio
    python src/run_daily.py --day 2026-11-11   # another programme day
"""
import argparse
import json
import random
import shutil
import sys
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from common import ROOT, STATE_FILE, load_config, load_json, save_json

PLAN = ROOT / "plan" / "topic_plan.json"
TOPICS = ROOT / "data" / "topics"
TAGS = {"course": "#football #soccer #footballhistory", "duel": "#football #soccer #footballstats", "top": "#football #soccer #top10",
        "tournoi": "#football #soccer #marblerace", "ligue": "#football #soccer #marblerace #marbleleague", "tirs": "#football #soccer #penalties"}


def caption_for(entry, data):
    """The data file's caption if it has one, else title + question + hashtags; the music credit is always added when needed."""
    text = data.get("caption", "").strip()
    if not text:
        q = (data.get("hook", {}).get("question") or "").strip().rstrip("?").capitalize()
        text = f"{data.get('title') or entry['title']} ⚽ {q + '? ' if q else ''}Comment below 👇\n{TAGS.get(entry['concept'], '#football #soccer')}"
    credit = load_json(ROOT / "assets" / "music" / "moods.json", {}).get("credits", {}).get(Path(data.get("music", {}).get("file", "")).name, "")
    if credit and credit not in text:
        text += "\n" + credit
    return text


def fallback_tournament(entry):
    """No data for this slot: a marble tournament of 16 nations drawn at random (no real facts), so the channel never goes quiet."""
    import random
    pool = {}
    for f in ("marble-world-cup-16-nations-one-winner.json", "the-underdog-cup-16-nations-that-never-won-a-world-cup.json"):
        base = load_json(TOPICS / f)
        for t in base["teams"]:
            pool.setdefault(t["id"], t)
    rng = random.Random(f"fallback-{entry['id']}")
    teams = rng.sample(sorted(pool.values(), key=lambda t: t["id"]), 16)
    day = date.fromisoformat(entry["date"])
    label = f"{day.day} {['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.month]}"
    d = dict(base)
    d.update({"title": f"Marble Cup ({label}): 16 nations, one winner", "seed": f"fallback-{entry['id']}", "teams": teams,
              "pairs": [[teams[i]["id"], teams[i + 1]["id"]] for i in range(0, 16, 2)],
              "hook": {"small": "16 NATIONS, ONE WINNER", "big": "THE MARBLE CUP", "question": "WHO WINS IT?"},
              "caption": "16 nations, 16 marbles, only one champion 🔥 Who did you pick? 👇\n#football #soccer #marblerace #worldcup"})
    path = ROOT / "data" / "fallback" / f"fallback-{entry['id']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, d)
    return path


def keep_league_state(data_file, data, build):
    """The Marble League remembers its table: after a successful post, the next state replaces the old one."""
    nxt = build / "state-next.json"
    if data.get("format") == "ligue" and nxt.exists():
        target = (Path(data_file).parent / data["statePath"]).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(nxt, target)
        print(f"league state saved: {target.relative_to(ROOT)}")


def post_time(entry, jitter_minutes):
    """The slot time moved by a few random minutes so posts don't look scheduled, like the other channels.
    The shift is drawn from the topic id, so a backup run gets the same time (and Zernio's duplicate guard works)."""
    slot = datetime.fromisoformat(f"{entry['date']}T{entry['time']}")
    shift = random.Random(f"time-{entry['id']}").randint(-jitter_minutes, jitter_minutes) if jitter_minutes else 0
    return (slot + timedelta(minutes=shift)).strftime("%Y-%m-%dT%H:%M")


def make_topic(entry, data_file):
    """Make the video of one data file. Returns what sending it needs."""
    from make_video import make

    backup = data_file.parent.name == "fallback"
    data = load_json(data_file)
    video, build = make(data_file)
    title = data["title"] if backup else entry["title"]
    info = {"video": str(video), "caption": caption_for(entry, data), "lang": "en", "title": title}
    # next to the video: its folder is named after the data file, which is not the topic id for the Marble League
    # (one file for the whole season) or a backup tournament
    save_json(Path(video).parent / "info.json", info)
    return {"data_file": data_file, "data": data, "build": build, "info": info, "title": title, "backup": backup}


def send_topic(entry, made, when, state, args, config):
    """Schedule one made video on Zernio and remember it (state.json, posts_log.jsonl). Returns the Telegram line."""
    from publish import publish

    title, info = made["title"], dict(made["info"], post_time=when)
    if args.no_publish:
        return f"🎬 Vidéo faite (non publiée) : {title}"
    post_ids = [pid for pid in publish(info, when, args.dry_run) if pid]
    if args.dry_run:
        return f"🧪 Essai : {title} aurait été programmée pour {when}"
    key = f"fallback:{entry['id']}" if made["backup"] else entry["id"]  # a backup tournament leaves the planned topic to write
    category = "The Marble Tournament" if made["backup"] else entry.get("category", "")
    slot = f"{entry['date']}T{entry['time']}"
    state.setdefault("posts", []).extend({"id": pid, "lang": "en", "topic": key, "title": title, "when": when, "slot": slot}
                                         for pid in post_ids)
    state["posts"] = state["posts"][-60:]
    state.setdefault("en", []).append(key)
    save_json(STATE_FILE, state)  # saved after each video: a crash later never leads to a double post
    # same line format as the other channels, so Stats Hub finds each post's format and title
    with open(ROOT / "posts_log.jsonl", "a", encoding="utf-8") as f:
        for pid in post_ids:
            f.write(json.dumps({"zernio_post_id": pid, "topic": key, "category": category, "title": title, "lang": "en",
                                "when": when, "channel": config.get("channel_name", "")}, ensure_ascii=False) + "\n")
    keep_league_state(made["data_file"], made["data"], made["build"])
    return f"✅ Programmée pour {when.replace('T', ' ')} : {title}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-publish", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--day", help="programme day YYYY-MM-DD (default: today, Paris time)")
    args = ap.parse_args()

    import notify

    config = load_config()
    tz = ZoneInfo(config["timezone"])
    now = datetime.now(tz).replace(tzinfo=None)
    day = date.fromisoformat(args.day) if args.day else now.date()
    plan = load_json(PLAN)
    slots = [e for e in plan if e.get("day") == day.isoformat()]
    state = load_json(STATE_FILE, {})
    done = set(state.get("en", []))
    report, failed = [], False
    for entry in slots:
        slot = f"{entry['date']}T{entry['time']}"
        if entry.get("ready") or entry["id"] in done or f"fallback:{entry['id']}" in done:
            print(f"already scheduled: {slot} {entry['title']}")
            continue
        when = post_time(entry, int(config.get("post_time_jitter_minutes", 0)))
        if not args.no_publish and datetime.fromisoformat(when) <= now + timedelta(minutes=20):
            report.append(f"⏰ Trop tard pour {slot} : {entry['title']}")
            failed = True
            continue
        data_file = TOPICS / f"{entry['id']}.json"
        if not data_file.exists() and entry["concept"] == "ligue" and "season 1: matchday" in entry["title"]:
            data_file = TOPICS / "marble-league-season-1.json"  # one file for the whole season: the table lives in state/
        if not data_file.exists():
            data_file = fallback_tournament(entry)
            report.append(f"⚠️ Données manquantes pour {slot} : {entry['title']}. Tournoi de secours à la place. Dis-le à Claude.")
            failed = True
        try:
            made = make_topic(entry, data_file)
        except (Exception, SystemExit) as e:
            failed = True
            traceback.print_exc()
            report.append(f"❌ Vidéo ratée : {entry['title']}\n{str(e)[-400:]}")
            if data_file.parent.name == "fallback":
                continue
            # the topic itself may be broken (a bad data file): a backup tournament keeps the slot filled
            try:
                made = make_topic(entry, fallback_tournament(entry))
                report.append("↪️ Tournoi de secours fait à la place. Dis-le à Claude.")
            except (Exception, SystemExit) as e2:
                traceback.print_exc()
                report.append(f"❌ Le tournoi de secours a raté aussi : problème général, voir GitHub.\n{str(e2)[-300:]}")
                continue
        try:
            report.append(send_topic(entry, made, when, state, args, config))
        except (Exception, SystemExit) as e:
            failed = True
            traceback.print_exc()
            report.append(f"❌ Envoi à Zernio raté : {made['title']}\n{str(e)[-400:]}")
    if not slots:
        report.append(f"Aucun sujet prévu le {day.isoformat()} dans le plan.")
    text = "\n".join(report) or "Rien à faire aujourd'hui."
    print(text)
    if report and not args.dry_run:
        notify.send(text)
        if failed:
            (ROOT / "telegram-alert-sent").write_text("1")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
