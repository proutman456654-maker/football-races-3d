# Channel Blueprint: Football Races 3D (3D data-video channel)

> **Pour Waël (résumé en français)** : cette fiche résume tout le projet foot, à savoir comment il marche, comment
> il a été monté, les règles de travail et toutes les erreurs à ne pas refaire. Pour une future chaîne du même genre
> (vidéos 3D faites à partir de données, sans voix ni images de banque), donne cette fiche à Claude au début
> de la conversation. Elle est en anglais, comme les fiches des autres chaînes, parce que c'est Claude qui la lit.

**Who this is for:** Claude, in a new conversation, asked by the owner (Waël) to create a new automated TikTok +
Instagram channel. This channel type has **no voice and no stock footage**: every video is rendered in code
(HyperFrames + three.js) from a small checked data file. For voice + stock-footage channels, read
`C:\Users\wqach\hidden-bible-facts\CHANNEL-BLUEPRINT.md` instead (or as well: sections 2, 3.2 and 9.1 apply to every channel).
**Read this fully before doing anything. Reuse the reference implementation; do not reinvent it.**

---

## 0. The reference implementation (copy it, don't rewrite it)

- **Public GitHub repo:** `proutman456654-maker/football-races-3d` (public = unlimited free Actions minutes; secrets stay secret).
- **Local copy:** `C:\Users\wqach\football-races-3d`. Live since **8 Nov 2026**.

```
engine/build.mjs           data file -> HyperFrames project (one composition per video)
engine/formats/*.mjs       one file per format: course (Title Race), duel, top (Top 10), tournoi (marble tournament),
                           ligue (Marble League, a table kept across weeks), common.mjs (titles, STR texts per language)
engine/assets/flags/       272 country flags (flag-icons, MIT). Clubs get a flag DRAWN from colours + pattern + code, never a crest
engine/mix_audio.py        music cut on the beat + sound effects + loudness (-14 LUFS)
src/make_video.py          build -> mix -> render (hyperframes@0.9.23, pinned) -> phone copy -> checks (>= 61 s, -14 LUFS, no silence)
src/run_daily.py           daily job: the 2 slots of the day, jitter, backup tournament, Zernio, state, posts_log
src/check_data.py          data checker: format rules + a REAL build; --todo lists missing data, --all checks every file
src/publish.py / notify.py Zernio API / Telegram alerts (identical to the other channels)
src/fetch_audio.py         downloads Pixabay music + sound effects at render time (never stored in the public repo)
src/schedule_launch.py     one-off: schedules hand-rendered launch videos (checks the account usernames first)
plan/build_plan_en.py      builds the 730-topic year plan -> plan/topic_plan.json
data/topics/<id>.json      one checked data file per topic, written ahead by the cloud routine
state/                     Marble League table (saved after each matchday)
tools/audit.py             full read-only audit (~50 checks), run until "0 problem(s)"
ROUTINE-PROMPT.md          the cloud routine's prompt   profile/PROFILE.md  profile kit   PROCHAINES-ETAPES.md  owner's to-do (French)
```

---

## 1. How the system works

```
Mon + Thu 06:00 UTC  Claude cloud routine (Opus) writes data/topics/*.json for the next 16 days from Wikipedia
                     raw wikitext, checks them with check_data.py (real build), commits only data/topics
Daily 07:17 UTC      GitHub Actions: programme day D = slot 21:00 D + slot 02:00 D+1 (Paris), each moved ±35 min
(+12:47 backup)      -> render 2 videos (~50-65 min each on GitHub CPU) -> Zernio scheduled post (TikTok + Instagram)
                     -> state.json + posts_log.jsonl + league table committed (even if the job fails)
every 30 min         notify.yml (19-22h and 0-3h UTC): Zernio "is it live?" -> Telegram ✅ / ❌, account health,
around post times    "nothing scheduled for this slot" alert one hour after each slot
Stats Hub (PC)       C:\Users\wqach\stats-hub reads the channel with its own Zernio key (label FOOTBALL_RACES_3D)
```

- **Safety nets:** missing data file, or a topic that fails to render → a **backup marble tournament** (16 random
  nations, no facts) goes out instead, Telegram says so. A backup run never posts twice (state + Zernio Idempotency-Key;
  the jitter is seeded by the topic id so the backup run gets the same time and the same key).
- **Cost: $0/month** (public repo, Zernio free for 2 accounts, music free, the routine runs on the owner's subscription).
- The owner's PC is not needed.

---

## 2. Rules of engagement with the owner (important)

- Talk to the owner **in French**: short, simple, step by step, not too much at once. All on-screen text, titles and
  captions of this channel are **English**.
- **Security first**: never install anything without asking and saying it is official and safe. No unknown repos.
- **Never handle keys or passwords**: never ask for a key in chat, never print `.env`. The owner pastes keys into
  `.env` and GitHub Secrets. Exception done once on explicit request: adding the channel to Stats Hub with the hub's
  own `app.channels.add()`, reading the key from the channel `.env` inside the process, never printing it.
- **Confirm before anything goes public** (posts, repo visibility, account changes).
- **Show an example video before applying a style change everywhere.** The owner dislikes **whooshes on cuts**.
- **Audit = run, fix, re-run from zero until 0 non-conformity** (`python tools/audit.py`).
- **One email per channel** with its own TikTok, Instagram, GitHub account, Zernio account.
- Classifier-blocked before (don't retry): `gh repo create --public` until the owner approved explicitly; a GitHub
  workflow relaying Wikipedia to the cloud routine (bypassing the network policy) → the owner adds the domains to
  the cloud environment allowlist instead.

---

## 3. Setting up a new channel of this type, step by step

### 3.1 Ask the owner first (one round)
1. Niche and angle; language (one account per language); new or existing accounts.
2. Posts per day and times. Football: 21:00 + 02:00 Paris (21:00 = Europe, Africa, Gulf evening; 02:00 = US evening,
   the best-paying audience). Review TikTok analytics (countries, views per slot) after ~2 weeks.
3. Which formats (see 4.3) and the launch date.

### 3.2 Accounts (owner does them; give exact click paths)
- New email → TikTok (**personal** account, never business: Creator Rewards pays only personal), Instagram
  (**professional/Creator**, needed by the API; no "AI-generated profile"), GitHub, Zernio (connect TikTok + Instagram).
- **Existing account reused** (football case): set old reposted edits to "Only me" on TikTok (TikTok Studio,
  done in the built-in browser after a QR login) and **archive** them on Instagram, **from the phone app**
  (Instagram's website can only delete reels). Since 2024 Instagram stops recommending accounts that repost others' content.
  TikTok allows a username change once per 30 days. Zernio keeps the old username in its cache; posting is by
  account id, so nothing breaks.
- Telegram: same bot/chat as the other channels; `channel_name` + `telegram_emoji` prefix every message.
- Claude GitHub app on the new GitHub account (github.com/apps/claude), and the data sites allowlisted in the
  cloud environment (football: `en.wikipedia.org`, `www.uefa.com`), else the routine gets 403.

### 3.3 Repo
1. Owner approves a **public** repo. Copy the reference repo without `.env`, `output/`, `build/`, `state.json`,
   `notified.json`, `posts_log.jsonl`, `state/`, `data/fallback/`.
2. Owner adds secrets `ZERNIO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (chat id is a secret in a public repo).
3. `python src/publish.py accounts` → account ids into `config.json`. Pin the local remote to the login:
   `https://<login>@github.com/<login>/<repo>.git`.

### 3.4 Plan, data, launch
1. Write `plan/build_plan_en.py` (730 topics, categories = formats, `needs` field holds back topics needing unbuilt
   engine features, `ready` marks hand-made launch videos). Set START to the real launch day.
2. Write the first 2 weeks of data yourself, `python src/check_data.py --all` until clean.
3. Render the launch videos on the PC, check them (`ffprobe`, ebur128 −14 LUFS, silencedetect, a frame sheet), show
   the owner, then `python src/schedule_launch.py` (dry run first).
4. GitHub test: Actions → Daily → `topic=<id>` (render only), compare with the PC render, then switch the crons on.
5. Create the routine (section 6), add the channel to Stats Hub, run `tools/audit.py` until 0 problem(s).

---

## 4. What to change for a new niche

### 4.1 `config.json`
`publish_mode` (schedule), `timezone`, `platforms`, `min_seconds` 61, `post_time_jitter_minutes` 35,
`languages.<lang>.post_times`, `accounts`, `expected_usernames` (only used by schedule_launch.py), `channel_name`,
`telegram_emoji`, `telegram_chat_id` left empty (secret).

### 4.2 Music (`assets/music/moods.json`)
`urls` (Pixabay links, downloaded at render, never committed: their licence forbids redistributing the file),
`credits` (a CC BY track may be committed; its credit line goes in the caption), `beat` per track
(`pulse`, `phase`, `entry_pulse_index`, measured once), `sfx_urls` (pinned to the HyperFrames version).

### 4.3 Formats and data files
Built: **course** (Title Race: towers grow per edition, ≤ 8 teams, ≤ 48 editions), **duel** (two sides by year or
decade), **top** (10 items, values going down), **tournoi** (16 teams, 8 pairs, seeded, no real facts), **ligue**
(Marble League, one file for the whole season + table in `state/`). Planned, not built yet: Blind Ranking, 60-Second
Challenge, Penalties, Draft, Mystery XI, Legendary Match, Evolution, Who Am I, plus a fast mode and player marbles.
Data rules (checked by check_data.py): title = plan title, `lang`, English only, UPPERCASE on-screen text, notes
≤ 40 chars, caption = 1-2 sentences + question + 👇 + **≤ 5 lowercase hashtags** + credit line, `foot` = source + date,
video 61-95 s. Language strings live in `STR` (`formats/common.mjs`): a twin channel in another language is
mostly new data files (Spanish twin idea noted).

---

## 5. Lessons learned (do not repeat these mistakes)

### 5.1 Facts
- **Wikipedia raw wikitext** (`index.php?title=X&action=raw`) parsed locally, totals **asserted** against the page's
  own totals. Web-fetch summaries proved wrong (a Haaland figure). Live stats say "as of <date>"; if sources disagree, skip.
- The routine uses **Opus** (a wrong number damages the channel), ≤ 12 files per run, commits only `data/topics`.

### 5.2 Video
- Fit texts on one line: the source line uses `font-size = min(28, floor(880/(len*0.5)))`; long big labels shrink.
- Event ids by index (`ev${i}`): two editions in one year duplicated ids.
- A winner's "pop" must grow outward (`transform-origin`) so it never covers "vs".
- Profile picture: one subject filling the circle, plain background, the name in 2 big lines; it must read at 40 px.

### 5.3 Technical traps
- GitHub runner has **FFmpeg 6.1**, the PC 9.0: `mix_audio.py` uses `-filter_complex_script` (≤ 6) or `-/filter_complex` (≥ 7).
- FFmpeg hung waiting for input → every subprocess gets `stdin=DEVNULL`.
- Render on GitHub CPU: ~51 min for a 68 s video (`--no-browser-gpu --workers 3`) → job timeout 300 min, public repo.
  The GitHub render matched the PC frame for frame.
- Ubuntu package servers sometimes fail → install FFmpeg with 3 tries.
- **info.json must be saved next to the video**: the output folder is named after the data FILE, not the topic id
  (Marble League, backup tournaments). This bug would have broken every league matchday; found by the audit.
- `git add a b c` with one missing file adds nothing → add files one by one in the "save state" step.
- "Nothing scheduled" alert must check **each slot**: the 02:00 post is made the day before.
- Several GitHub accounts on one PC: pin remotes to the login; a private repo using `gh auth git-credential` fails
  when another gh account is active → per-repo helper returning `gh auth token --user <login>`.
- Windows PowerShell 5.1 mangles quotes in here-string commit messages → `git commit -F <file>`; jq filters with
  `\(...)` → run them in Bash.

---

## 6. Cloud routine
RemoteTrigger `trig_01AmHWxt8X9yM8Xt8woJQXiq`, cron `0 6 * * 1,4` (UTC), model `claude-opus-5-5`, source = the repo,
tools `Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch`, **no MCP connections** (`clear_mcp_connections: true`).
Prompt: `ROUTINE-PROMPT.md` (check `--todo --days 16`, write ≤ 12 files in plan order, skip unbuilt formats and
report them, validate, commit `data/topics` only, pull --rebase, push).

## 7. Audit checklist (`tools/audit.py`)
GitHub (public, 3 secrets, workflows active) · workflows (ubuntu-24.04, ref main, state saved on failure, crash alert,
concurrency, 3-day artifacts, timeout, 2 crons, notify hours cover each post time winter + summer) · safety nets
(backup tournament, info.json path, jitter, per-slot alert, account health) · keys never in git history ·
config · Zernio health + every recorded post scheduled/published on both platforms · code compiles, engine JS valid,
HyperFrames pinned · plan 730 unique topics, slot structure, launch posts, all data passes the checker, data ≥ 7 days
ahead, no unbuilt format within 7 days · music downloaded, credited, no Pixabay file in the repo · Stats Hub entry +
key · last daily run succeeded, cache < 8 GB. Not in the script: the routine (check with RemoteTrigger).

## 8. Owner's channels (12 Nov 2026)
| Channel | GitHub repo (all public) | Routine |
|---|---|---|
| Fun Facts For Real | `proutman123321-creator/fun-facts-shorts` | trig_015K6jsrb5fKSc766tFZWhys (Mon 07:00 UTC) |
| Hidden Bible Facts | `jujuanne06-eng/hidden-bible-facts` | trig_01PWhc48cFGpbyrtWgMs2exU (Mon 07:30 UTC) |
| Alpha Mindset | `jaskier691000-jpg/alpha-mindset-shorts` | trig_015Kato9WHmogSPgwZU6pUY1 (Mon 08:00 UTC) |
| Money Tricks Exposed | `jaskier69200-star/money-tricks-exposed` | trig_01TBfiDoLJ5zwRshjc8GQSfY (Mon 08:30 UTC) |
| Football Races 3D | `proutman456654-maker/football-races-3d` | trig_01AmHWxt8X9yM8Xt8woJQXiq (Mon + Thu 06:00 UTC) |

Football: Instagram `@football_races_3d`, TikTok `footskillzzz_edits` (rename planned), 21:00 + 02:00 Paris ±35 min.
