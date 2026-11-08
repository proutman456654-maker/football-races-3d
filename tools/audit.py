"""Full audit of the Football Races 3D channel (same checklist as the other channels, adapted to this pipeline).

    python tools/audit.py

Needs: .env (Zernio key) for the account and post checks, and the GitHub CLI logged in to proutman456654-maker for the
repository checks. Reads only: nothing is changed, sent or published. Prints every check and ends with the number of
problems. Fix, then run it again from zero until it says 0 problem(s).
Not checked here (Claude checks them with its own tools): the Monday/Thursday data routine on claude.ai.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from common import load_env  # noqa: E402

REPO = "proutman456654-maker/football-races-3d"
GH_USER = "proutman456654-maker"
BUILT = {"course", "duel", "top", "tournoi", "ligue"}
problems, notes = [], []
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def check(ok, label, detail=""):
    print(f"  {'OK ' if ok else 'XX '} {label}" + (f"  ({detail})" if detail else ""))
    if not ok:
        problems.append(label + (f": {detail}" if detail else ""))


def run(*cmd, cwd=ROOT, env=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env,
                       stdin=subprocess.DEVNULL)
    return r.returncode, r.stdout + r.stderr


# the channel's own GitHub account, whichever account the GitHub CLI has active
_, token = run("gh", "auth", "token", "--user", GH_USER)
GH_ENV = dict(os.environ, GH_TOKEN=token.strip()) if token.strip() and " " not in token.strip() else None


def gh_json(*args):
    code, out = run("gh", *args, env=GH_ENV)
    try:
        return json.loads(out) if code == 0 else None
    except json.JSONDecodeError:
        return None


def section(name):
    print(f"\n== {name}")


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


tz = ZoneInfo("Europe/Paris")
now = datetime.now(tz).replace(tzinfo=None)
today = now.date()

section("GitHub repository")
repo = gh_json("api", f"repos/{REPO}")
check(bool(repo), "repository reachable with the channel's GitHub account")
if repo:
    check(repo.get("visibility") == "public", "repository is public (unlimited free Actions minutes)", repo.get("visibility"))
secrets = gh_json("api", f"repos/{REPO}/actions/secrets") or {}
names = {s["name"] for s in secrets.get("secrets", [])}
for name in ("ZERNIO_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
    check(name in names, f"secret {name} is set")
workflows = gh_json("api", f"repos/{REPO}/actions/workflows") or {}
states = {w["path"]: w["state"] for w in workflows.get("workflows", [])}
for wf in (".github/workflows/daily.yml", ".github/workflows/notify.yml"):
    check(states.get(wf) == "active", f"workflow {wf} is active", states.get(wf, "missing"))

section("Workflows")
daily = (ROOT / ".github/workflows/daily.yml").read_text(encoding="utf-8")
notify = (ROOT / ".github/workflows/notify.yml").read_text(encoding="utf-8")
check("runs-on: ubuntu-24.04" in daily and "runs-on: ubuntu-24.04" in notify, "runners pinned to ubuntu-24.04")
check("ref: main" in daily, "daily job checks out the latest main (backup runs see saved state)")
check(re.search(r"Save which topics.*\n\s+if: always\(\)", daily) is not None, "state is saved even when the job fails")
check('[ -e "$f" ] && git add' in daily or 'if [ -e "$f" ]; then git add' in daily, "state saved even before posts_log.jsonl exists")
check("Telegram alert if the job failed" in daily, "Telegram alert when the job breaks")
check("concurrency:" in daily, "one daily job at a time (concurrency)")
check("retention-days: 3" in daily, "videos kept 3 days as artifacts")
timeout = re.search(r"timeout-minutes: (\d+)", daily)
check(bool(timeout) and int(timeout.group(1)) >= 240, "job time limit fits two 3D renders (50-65 min each)", timeout and timeout.group(1))
crons = re.findall(r"^\s+- cron: \"([^\"]+)\"", daily, re.M)
notify_crons = re.findall(r"^\s+- cron: \"([^\"]+)\"", notify, re.M)
check(len(crons) == 2, "daily schedule ON: main run + backup run", f"{len(crons)} active cron(s)")
check(len(notify_crons) >= 1, "post checks schedule ON", f"{len(notify_crons)} active cron(s)")
first_hour = int(crons[0].split()[1]) if crons else 99
# main run + up to 1 h GitHub delay + 2 renders of ~1 h must end before the first post (21:00 Paris = 19:00 UTC in summer)
check(first_hour <= 10, "daily run starts early enough to finish before 21:00 Paris", f"{first_hour}:xx UTC")
config = load("config.json")
en = config["languages"]["en"]
hours = set()
for c in notify_crons:
    for part in c.split()[1].split(","):
        a, _, b = part.partition("-")
        hours.update(range(int(a), int(b or a) + 1))
uncovered = []
for t in en["post_times"]:
    h = int(t[:2])
    for offset in (1, 2):  # winter and summer
        utc = (h - offset) % 24
        if utc not in hours or (utc + 1) % 24 not in hours:
            uncovered.append(f"{t} Paris (UTC+{offset})")
check(not uncovered, "post checks run at each post time and the hour after, winter and summer", ", ".join(uncovered))

run_daily_py = (ROOT / "src/run_daily.py").read_text(encoding="utf-8")
notify_py = (ROOT / "src/notify.py").read_text(encoding="utf-8")
check("def fallback_tournament" in run_daily_py and "made = make_topic(entry, fallback_tournament(entry))" in run_daily_py,
      "a missing or broken topic becomes a backup tournament, never an empty slot")
check('Path(video).parent / "info.json"' in run_daily_py, "info.json saved next to the video (Marble League, backups)")
check("def post_time" in run_daily_py and "post_time_jitter_minutes" in run_daily_py, "post times moved by the jitter")
main_part = notify_py.split("__main__")[-1]
check("check_today_scheduled()" in main_part and 'missing-{today}-{t}' in notify_py,
      "Telegram alert when a slot was not scheduled (slot by slot)")
check("check_accounts_now()" in main_part, "account cut by Meta/TikTok reported within 30 min")

section("Keys never in the repository")
code, tracked = run("git", "ls-files")
tracked_files = tracked.split()
check(".env" not in tracked_files, ".env is not tracked by git")
check(".env" in (ROOT / ".gitignore").read_text(encoding="utf-8").split(), ".env is in .gitignore")
load_env()
values = [os.environ.get(k, "") for k in ("ZERNIO_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")]
code, history = run("git", "log", "-p", "--all")
leaked = [v for v in values if v and len(v) > 6 and v in history]
check(not leaked, "no key or chat id anywhere in the git history", f"{len(leaked)} found" if leaked else "")

section("Settings (config.json)")
check(config["publish_mode"] == "schedule", "publish_mode is 'schedule'", config["publish_mode"])
check(config["timezone"] == "Europe/Paris" and en["post_times"] == ["21:00", "02:00"], "post times 21:00 and 02:00 Paris")
check(config.get("post_time_jitter_minutes") == 35 and config.get("min_seconds") == 61, "±35 min jitter, videos ≥ 61 s")
check(all(en["accounts"].get(p) for p in ("tiktok", "instagram")), "TikTok and Instagram account ids set")
check(not config.get("telegram_chat_id"), "Telegram chat id kept out of the public repository (it is a secret)")
check(config.get("channel_name") == "Football Races 3D", "channel name set (every Telegram message carries it)")

section("Zernio accounts and scheduled posts")
state = load("state.json") if (ROOT / "state.json").exists() else {}
try:
    from publish import api  # noqa: E402
    for platform, account in en["accounts"].items():
        _, h = api("GET", f"/accounts/{account}/health")
        token_status = h.get("tokenStatus") or {}
        can = h.get("permissions", {}).get("canPost", h.get("canPost", True))
        check(h.get("status") == "healthy" and can, f"{platform} connected and can post", token_status.get("expiresIn", ""))
    bad = []
    for p in state.get("posts", []):
        _, d = api("GET", f"/posts/{p['id']}")
        d = d.get("post", d)
        statuses = {x.get("platform"): (x.get("status") or "").lower() for x in d.get("platforms", [])}
        if set(statuses) != {"tiktok", "instagram"} or any(s in ("failed", "error", "rejected", "cancelled") for s in statuses.values()):
            bad.append(f"{p['when']} {statuses}")
        elif datetime.fromisoformat(p["when"]) > now and d.get("status") != "scheduled":
            bad.append(f"{p['when']} is {d.get('status')}")
    check(not bad, "every recorded post is scheduled or published on TikTok + Instagram", "; ".join(bad[:3]))
except SystemExit as e:
    check(False, "Zernio reachable with the key in .env", str(e)[:120])

section("Code")
py_files = [str(p) for p in (ROOT / "src").glob("*.py")] + [str(Path(__file__))]
code, out = run(sys.executable, "-m", "py_compile", *py_files)
check(code == 0, "every Python file compiles", out.strip()[:200])
mjs = sorted((ROOT / "engine").glob("*.mjs")) + sorted((ROOT / "engine" / "formats").glob("*.mjs"))
broken = [p.name for p in mjs if run("node", "--check", str(p))[0] != 0]
check(not broken, f"the {len(mjs)} engine files are valid JavaScript", ", ".join(broken))
moods = load("assets/music/moods.json")
pinned = "hyperframes@0.9.23"
check(pinned in (ROOT / "src/make_video.py").read_text(encoding="utf-8")
      and all(pinned in u for u in moods.get("sfx_urls", {}).values()), "HyperFrames version pinned (render and sounds)")

section("Plan and data")
plan = load("plan/topic_plan.json")
check(len(plan) == 730 and len({p["id"] for p in plan}) == 730, "yearly plan: 730 different topics")
days = {}
bad_slots = []
for e in plan:
    days.setdefault(e["day"], []).append(e)
    d = date.fromisoformat(e["day"])
    want = d if e["time"] == "21:00" else d + timedelta(days=1)
    if e["time"] not in ("21:00", "02:00") or e["date"] != want.isoformat():
        bad_slots.append(e["id"])
check(not bad_slots and all(len(v) == 2 for v in days.values()), "every programme day = 21:00 D + 02:00 D+1",
      f"{len(bad_slots)} misplaced" if bad_slots else "")
posted = {(p.get("slot") or p["when"]) for p in state.get("posts", [])}
missing_launch = [e["id"] for e in plan if e.get("ready") and f"{e['date']}T{e['time']}" not in posted]
check(not missing_launch, "the 6 launch videos are scheduled", ", ".join(missing_launch))
code, out = run(sys.executable, "src/check_data.py", "--all")
check(code == 0, "every data file passes the checker (rules + real build)", out.strip().splitlines()[-1] if out.strip() else "")
code, out = run(sys.executable, "src/check_data.py", "--todo", "--days", "16")
ready = re.search(r"Data ready until: (\d{4}-\d\d-\d\d)", out)
ready_day = date.fromisoformat(ready.group(1)) if ready else date.max
check(ready_day >= today + timedelta(days=7), "data written at least 7 days ahead (the routine runs Monday and Thursday)",
      f"until {ready.group(1) if ready else 'end of plan'}")
soon = [e for e in plan if e["concept"] not in BUILT and today <= date.fromisoformat(e["day"]) <= today + timedelta(days=7)]
check(not soon, "no unbuilt format in the next 7 days (it would become a backup tournament)",
      ", ".join(f"{e['date']} {e['concept']}" for e in soon[:4]))
first_unbuilt = next((e for e in plan if e["concept"] not in BUILT and date.fromisoformat(e["day"]) >= today), None)
needs = next((e for e in plan if e.get("needs") and date.fromisoformat(e["day"]) >= today), None)
if first_unbuilt:
    notes.append(f"first unbuilt format: '{first_unbuilt['concept']}' on {first_unbuilt['date']} (build it before)")
if needs:
    notes.append(f"first topic needing an engine feature ({needs['needs']}): {needs['date']}")

section("Music and sound")
code, out = run(sys.executable, "src/fetch_audio.py")
check(code == 0, "music and sound effects download", out.strip()[-160:])
not_here = [f for f in moods.get("urls", {}) if not (ROOT / "assets/music" / f).exists()]
check(not not_here, "every music link gave its track", ", ".join(not_here))
check(all((ROOT / "assets/music" / f).exists() for f in moods.get("credits", {})), "every credited track exists")
check(set(moods.get("beat", {})) <= {p.name for p in (ROOT / "assets/music").glob("*.mp3")}, "every track has its beat timing")
sfx_missing = [f for f in moods.get("sfx_urls", {}) if not (ROOT / "assets/sfx" / f).exists()]
check(not sfx_missing, "every sound effect is here", ", ".join(sfx_missing))
in_repo = [f for f in tracked_files if f.startswith(("assets/music/", "assets/sfx/")) and f.endswith(".mp3")
           and f.rsplit("/", 1)[-1] not in moods.get("credits", {})]
check(not in_repo, "no Pixabay file in the public repo, only credited CC BY tracks", ", ".join(in_repo))

section("Stats Hub (dashboard on the PC)")
hub = ROOT.parent / "stats-hub"
if hub.exists():
    channels = json.loads((hub / "channels.json").read_text(encoding="utf-8")) if (hub / "channels.json").exists() else {}
    label = next((k for k, v in channels.items() if Path(str(v.get("repo", ""))).resolve() == ROOT), None)
    check(bool(label), "the channel is listed in Stats Hub with this folder")
    keys = {}
    if (hub / ".env").exists():
        for line in (hub / ".env").read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            keys[k.strip()] = v.strip()
    check(bool(label) and len(keys.get(f"ZERNIO_API_KEY_{label}", "")) > 10, "its Zernio key is in Stats Hub")
else:
    notes.append("Stats Hub folder not found next to this one: skipped")

section("Last GitHub runs")
runs = gh_json("run", "list", "-R", REPO, "--workflow", "daily.yml", "--limit", "10", "--json", "conclusion,createdAt,event,status")
finished = [r for r in runs or [] if r.get("status") == "completed" and r.get("conclusion") != "cancelled"]
last = (finished or [None])[0]
check(bool(last) and last.get("conclusion") == "success", "last daily run succeeded", (last or {}).get("createdAt", "no run"))
caches = gh_json("cache", "list", "-R", REPO, "--limit", "50", "--json", "key,sizeInBytes") or []
biggest = max((c["sizeInBytes"] for c in caches), default=0) / 1e9
check(bool(caches) and biggest < 8, "GitHub cache well under its 10 GB limit", f"biggest entry {biggest:.1f} GB")

print("\nNotes:")
for n in notes:
    print(f"  - {n}")
print(f"\n{len(problems)} problem(s)" + (":" if problems else ""))
for p in problems:
    print(f"  - {p}")
sys.exit(1 if problems else 0)
