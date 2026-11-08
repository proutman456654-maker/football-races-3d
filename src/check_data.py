"""Check topic data files before they go to the daily render, and list the work still to do.

Usage:
    python src/check_data.py --todo [--days 16]     # plan entries of the next N days that still need a data file
    python src/check_data.py data/topics/<id>.json  # check files (format rules + a real build); exit 1 on any problem
    python src/check_data.py --all                  # check every data file

A file passes only if it follows the rules of its format AND builds into a video of 61 to 95 seconds.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
TOPICS = ROOT / "data" / "topics"
PLAN = ROOT / "plan" / "topic_plan.json"
FLAGS = ROOT / "engine" / "assets" / "flags"
BUILT = {"course", "duel", "top", "tournoi", "ligue"}  # formats the engine can render today
FRENCH = re.compile(r"\b(contre|année|les|des|du|journée|équipe|billes|meilleurs?|vainqueurs?)\b", re.I)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def plan():
    return load(PLAN)


def has_data(entry):
    if (TOPICS / f"{entry['id']}.json").exists() or entry.get("ready"):
        return True
    return entry["concept"] == "ligue" and "season 1: matchday" in entry["title"] and (TOPICS / "marble-league-season-1.json").exists()


def todo(days):
    today = datetime.now(ZoneInfo("Europe/Paris")).date()
    end = today + timedelta(days=days)
    rows = [e for e in plan() if today <= date.fromisoformat(e["day"]) <= end and not has_data(e)]
    for e in rows:
        why = "" if e["concept"] in BUILT else f"  [format '{e['concept']}' not built yet: skip, report it]"
        if e.get("needs"):
            why += f"  [needs engine feature {e['needs']}: skip, report it]"
        print(f"{e['n']:4d} {e['date']} {e['time']} {e['concept']:8s} {e['id']}{why}")
    covered = [e for e in plan() if date.fromisoformat(e["day"]) >= today]
    first_gap = next((e for e in covered if not has_data(e)), None)
    print(f"\n{len(rows)} to write in the next {days} days. Data ready until: {first_gap['date'] + ' ' + first_gap['time'] + ' (exclusive)' if first_gap else 'end of plan'}")


def flag_ok(flag, club):
    return bool(club) or (FLAGS / f"{flag}.svg").exists()


def check_rules(d, path):
    p = []
    fmt = d.get("format")
    if fmt not in BUILT:
        return [f"format '{fmt}' is not built"]
    if d.get("lang") != "en":
        p.append('lang must be "en"')
    by_id = {e["id"]: e for e in plan()}
    stem = Path(path).stem
    if stem in by_id and d.get("title") != by_id[stem]["title"]:
        p.append(f"title must be exactly the plan title: {by_id[stem]['title']!r}")
    cap = d.get("caption", "")
    if fmt != "ligue":
        if not cap:
            p.append("caption missing")
        if len(cap) > 2000:
            p.append("caption too long")
        if len(re.findall(r"#\w+", cap)) > 5:
            p.append("more than 5 hashtags (Instagram limit)")
        if FRENCH.search(cap):
            p.append("caption looks French")
    moods = load(ROOT / "assets" / "music" / "moods.json")
    track = Path(d.get("music", {}).get("file", "")).name
    if track not in moods.get("beat", {}):
        p.append(f"music must be one of {list(moods['beat'])}")
    credit = moods.get("credits", {}).get(track)
    if credit and credit not in cap and fmt != "ligue":
        p.append("this track needs its credit line in the caption")
    texts = json.dumps({k: v for k, v in d.items() if k not in ("caption", "music")}, ensure_ascii=False)
    if FRENCH.search(texts):
        p.append("on-screen text looks French")
    if fmt == "course":
        teams = {t["id"]: t for t in d["teams"]}
        if len(teams) > 8:
            p.append(f"{len(teams)} teams: the Title Race shows 8 at most")
        if len(d["events"]) > 48:
            p.append(f"{len(d['events'])} events: 48 at most until the fast mode exists")
        for i, e in enumerate(d["events"]):
            if e["winner"] not in teams:
                p.append(f"event {e['year']}: winner {e['winner']} is not a team")
            if e.get("note") and e["p"] < 2:
                p.append(f"event {e['year']}: a note needs p >= 2")
            if e.get("big") and i and d["events"][i - 1]["p"] < 2:
                p.append(f"event {e['year']}: the event before a big one needs p >= 2")
        p += [f"team {t['id']}: flag {t['flag']} missing" for t in d["teams"] if not flag_ok(t["flag"], t.get("club"))]
    elif fmt == "duel":
        if len(d["sides"]) != 2:
            p.append("a duel has 2 sides")
        for s in d["steps"]:
            for part in s["a"] + s["b"]:
                if part[0] not in d["clubs"]:
                    p.append(f"step {s['year']}: club {part[0]} not in clubs")
            if s.get("note") and s["p"] < 2:
                p.append(f"step {s['year']}: a note needs p >= 2")
        p += [f"side {s['id']}: flag {s['flag']} missing" for s in d["sides"] if not flag_ok(s["flag"], s.get("club"))]
    elif fmt == "top":
        ranks = sorted(it["rank"] for it in d["items"])
        if ranks != list(range(1, 11)):
            p.append("a Top 10 needs ranks 1 to 10 exactly once")
        vals = [it["value"] for it in sorted(d["items"], key=lambda it: it["rank"])]
        if any(a < b for a, b in zip(vals, vals[1:])):
            p.append("values must not go up from no. 1 to no. 10")
    elif fmt == "tournoi":
        ids = [t["id"] for t in d["teams"]]
        if len(ids) != 16 or len(set(ids)) != 16:
            p.append("a tournament needs 16 different teams")
        flat = [x for pair in d["pairs"] for x in pair]
        if sorted(flat) != sorted(ids):
            p.append("the 8 pairs must use each team exactly once")
        seeds = [load(f).get("seed") for f in TOPICS.glob("*.json") if f.resolve() != Path(path).resolve()]
        if d.get("seed") in seeds:
            p.append("seed already used by another tournament")
        p += [f"team {t['id']}: flag {t['flag']} missing" for t in d["teams"] if not flag_ok(t["flag"], t.get("club"))]
    return p


def check_build(path):
    out = ROOT / "build" / f"check-{Path(path).stem}"
    r = subprocess.run(["node", str(ROOT / "engine" / "build.mjs"), str(path), str(out), "draft"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL)
    m = re.search(r"ok : \w+, ([\d.]+) s", r.stdout)
    if r.returncode or not m:
        return [f"build failed: {(r.stderr or r.stdout)[-500:]}"]
    secs = float(m.group(1))
    return [] if 61 <= secs <= 95 else [f"{secs} s: a video must last 61 to 95 s (change the p values)"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--todo", action="store_true")
    ap.add_argument("--days", type=int, default=16)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if a.todo:
        return todo(a.days)
    files = sorted(TOPICS.glob("*.json")) if a.all else [Path(f) for f in a.files]
    bad = 0
    for f in files:
        try:
            d = load(f)
            problems = check_rules(d, f)
            if not problems:
                problems = check_build(f)
        except Exception as e:  # malformed file
            problems = [f"{type(e).__name__}: {e}"]
        print(("OK   " if not problems else "FAIL ") + f.name + "".join(f"\n     - {x}" for x in problems))
        bad += bool(problems)
    print(f"\n{len(files) - bad} OK, {bad} to fix")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
