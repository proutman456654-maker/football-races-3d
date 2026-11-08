"""Every day on GitHub: make the 2 videos of the day from plan/topic_plan.json and schedule them on Zernio.

A programme day D holds two slots (Paris time): 21:00 on D, and 02:00 on D+1.
Each topic needs its data file, data/topics/<id>.json, written and checked in advance by the weekly routine.

Usage:
    python src/run_daily.py                    # today's programme day: make + schedule (PUBLIC at the slot time)
    python src/run_daily.py --no-publish       # only make the videos (test)
    python src/run_daily.py --dry-run          # make + show what would be sent to Zernio
    python src/run_daily.py --day 2026-11-11   # another programme day
"""
import argparse
import json
import shutil
import sys
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from common import OUTPUT, ROOT, STATE_FILE, load_config, load_json, save_json

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


def keep_league_state(data_file, data, build):
    """The Marble League remembers its table: after a successful post, the next state replaces the old one."""
    nxt = build / "state-next.json"
    if data.get("format") == "ligue" and nxt.exists():
        target = (Path(data_file).parent / data["statePath"]).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(nxt, target)
        print(f"league state saved: {target.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-publish", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--day", help="programme day YYYY-MM-DD (default: today, Paris time)")
    args = ap.parse_args()

    import notify
    from make_video import make
    from publish import publish

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
        when = f"{entry['date']}T{entry['time']}"
        if entry.get("ready") or entry["id"] in done:
            print(f"already scheduled: {when} {entry['title']}")
            continue
        if not args.no_publish and datetime.fromisoformat(when) <= now + timedelta(minutes=20):
            report.append(f"⏰ Trop tard pour {when} : {entry['title']}")
            failed = True
            continue
        data_file = TOPICS / f"{entry['id']}.json"
        if not data_file.exists() and entry["concept"] == "ligue" and "season 1: matchday" in entry["title"]:
            data_file = TOPICS / "marble-league-season-1.json"  # one file for the whole season: the table lives in state/
        if not data_file.exists():
            report.append(f"❌ Données manquantes pour {when} : {entry['title']} (data/topics/{entry['id']}.json)")
            failed = True
            continue
        try:
            data = load_json(data_file)
            video, build = make(data_file)
            info = {"video": str(video), "caption": caption_for(entry, data), "lang": "en", "post_time": when, "title": entry["title"]}
            save_json(OUTPUT / entry["id"] / "info.json", info)
            if args.no_publish:
                report.append(f"🎬 Vidéo faite (non publiée) : {entry['title']}")
                continue
            post_ids = publish(info, when, args.dry_run)
            if args.dry_run:
                report.append(f"🧪 Essai : {entry['title']} aurait été programmée pour {when}")
                continue
            state.setdefault("posts", []).extend({"id": pid, "lang": "en", "topic": entry["id"], "title": entry["title"], "when": when} for pid in post_ids if pid)
            state["posts"] = state["posts"][-60:]
            state.setdefault("en", []).append(entry["id"])
            save_json(STATE_FILE, state)  # saved after each video: a crash later never leads to a double post
            with open(ROOT / "posts_log.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({"topic": entry["id"], "title": entry["title"], "when": when, "posts": post_ids}, ensure_ascii=False) + "\n")
            keep_league_state(data_file, data, build)
            report.append(f"✅ Programmée pour {when} : {entry['title']}")
        except (Exception, SystemExit) as e:
            failed = True
            traceback.print_exc()
            report.append(f"❌ Échec : {entry['title']}\n{str(e)[-400:]}")
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
