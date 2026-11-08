"""Schedule the 6 launch videos (already rendered on the PC) through Zernio.

Usage:
    python src/schedule_launch.py --dry-run   # check the key, the accounts and the 6 posts; sends nothing
    python src/schedule_launch.py             # uploads and schedules the 6 videos (PUBLIC at their time)

Safety checks before anything is sent:
- the TikTok account behind the key must be the one named in config.json ("expected_usernames"),
  so a key from another channel can never post football videos there;
- every time must still be in the future;
- a video already scheduled (state.json) is never sent twice, and Zernio's Idempotency-Key covers re-runs.
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from common import ROOT, STATE_FILE, load_config, load_json, save_json
from publish import api, publish

LAUNCH = ROOT / "launch"


def check_accounts(config):
    """The ids in config.json must exist behind this key, and TikTok must be the expected account."""
    lang = config["languages"]["en"]
    ids = lang.get("accounts", {})
    expected = lang.get("expected_usernames", {})
    _, data = api("GET", "/accounts")
    accounts = data.get("accounts", data if isinstance(data, list) else [])
    by_id = {a.get("_id"): a for a in accounts}
    problems = []
    for platform in config["platforms"]:
        acc = by_id.get(ids.get(platform, ""))
        if not acc:
            problems.append(f"{platform}: the id in config.json is not one of this key's accounts")
            continue
        name = (acc.get("username") or acc.get("displayName") or "").lstrip("@").lower()
        want = expected.get(platform, "").lstrip("@").lower()
        if want and name != want:
            problems.append(f"{platform}: this key posts to @{name}, expected @{want}")
        print(f"{platform:<10} @{name}  ok")
    if problems:
        raise SystemExit("Nothing sent:\n- " + "\n- ".join(problems))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    config = load_config()
    check_accounts(config)
    items = load_json(LAUNCH / "launch.json")
    state = load_json(STATE_FILE, {})
    done = {p["topic"] for p in state.get("posts", [])}
    now = datetime.now(ZoneInfo(config["timezone"])).replace(tzinfo=None)
    for it in items:
        video = LAUNCH / it["file"]
        if not video.exists():
            raise SystemExit(f"Missing video: {video}")
        if datetime.fromisoformat(it["when"]) <= now:
            raise SystemExit(f"{it['when']} is already past: change launch/launch.json first.")
    for it in items:
        if it["id"] in done:
            print(f"already scheduled: {it['when']}  {it['title']}")
            continue
        info = {"video": str(LAUNCH / it["file"]), "caption": it["caption"], "lang": "en", "post_time": it["when"]}
        print(f"\n{it['when']}  {it['title']}")
        post_ids = publish(info, it["when"], args.dry_run)
        if args.dry_run:
            continue
        posts = state.setdefault("posts", [])
        posts += [{"id": pid, "lang": "en", "topic": it["id"], "title": it["title"], "when": it["when"]} for pid in post_ids if pid]
        state.setdefault("en", []).append(it["id"])
        save_json(STATE_FILE, state)  # saved after each video, so a crash never leads to a double post
    print("\nDry run: nothing was sent." if args.dry_run else "\nDone: the 6 videos are scheduled.")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
