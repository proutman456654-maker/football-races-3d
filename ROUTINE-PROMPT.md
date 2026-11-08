# Routine « Football Races 3D - write next data »

Créée avec RemoteTrigger (claude.ai/code/routines) une fois que github.com/apps/claude a accès à ce dépôt.
Cron `0 6 * * 1,4` (lundi et jeudi 06:00 UTC, avant le rendu de 07:17), modèle `claude-opus-5-5` (des chiffres faux abîment
la chaîne), source ce dépôt, outils `Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch`, aucune connexion MCP.
Elle écrit les fichiers de données des 16 jours à venir. Le rendu quotidien publie un tournoi de secours si un fichier manque.

## Prompt

You prepare the data for Football Races 3D, an automated English football channel (TikTok + Instagram, audience mostly
UK and US). This repository (football-races-3d) is used by a daily GitHub Actions job that turns one data file per topic
(data/topics/<id>.json) into a 3D video of about one minute, posted PUBLICLY. A wrong number damages the channel: every
fact must come from a source you actually read in this run, never from memory.

STEP 1 - Is work needed?
Run: python3 src/check_data.py --todo --days 16
It lists the plan entries of the next 16 days that still have no data file. If the list is empty, reply
'Data ready until <date>' and STOP (no commit). Entries marked "format not built yet" or "needs engine feature" are NOT
for you: skip them and list them in your final message (the owner's engineer builds those formats).

STEP 2 - Write the data files, in plan order, at most 12 per run.
For each entry, read plan/topic_plan.json (fields id, title, concept) and write data/topics/<id>.json.
Before writing a format for the first time in this run, read two existing files of the same format in data/topics and
copy their exact structure, keys and style (UPPERCASE on-screen texts, short notes of 40 characters or fewer, English only).
- "title" must be exactly the plan title. "lang": "en".
- "music": copy the block of an existing file, rotating the three tracks of assets/music/moods.json (field "beat" gives
  pulse, phase and entry_pulse_index). The Dark Moment track needs its credit line (moods.json "credits") at the end of
  the caption.
- "caption": one or two short sentences with a question that invites comments and the emoji 👇, then a new line with at
  most 5 lowercase hashtags (Instagram allows 5), then the credit line if needed.
- The "foot" line names the source and the date of the figures (e.g. "Source: Wikipedia, as of 12 November 2026.").

Formats:
- course (Title Race): teams = the distinct winners, 8 at most (if a competition has more than 8 different winners or more
  than 48 editions, do not write it: skip it and report it). One event per edition in time order with year, winner,
  w, score, l, place, p (beats: 1 to 4), optional note (needs p >= 2) and big (2 or 3 per video; the event before a big
  one needs p >= 2). Clubs have no flag file: give them "flag": "club-xxx" and a "club" block {pattern, colors, code}
  like the existing files (patterns: stripes, hoops, halves, sides, band, trim, sash, plain). Country flags are
  engine/assets/flags/<iso code>.svg (gb-eng, gb-sct, gb-wls, us, mx...).
- duel: two sides, steps by year (a season counts in the year it ends) or by decade ("label": "1990s"), each with
  "a" and "b" lists of [club code, number] and p; clubs block for every club code used; "k" scales the towers
  (k x the bigger final total should be about 40).
- top: exactly 10 items, rank 1 to 10, value going down from rank 1 to rank 10, name (short, UPPERCASE), full, years,
  country, optional note; a "club" block for the shirt (pattern band, stripes or plain; three colours).
- tournoi (marble tournament): no real facts, so no research. 16 teams (nations with their flag, or clubs with a club
  block), 8 "pairs" using each team once, a "seed" never used before (use "<id>"), the "rounds" and "end" blocks copied
  from an existing tournament. "Real fixtures" topics (e.g. a Champions League matchday): the first round must be 8 real
  fixtures of that matchday, checked on the competition's Wikipedia season page or uefa.com; if fewer than 8 are known,
  pick the 8 biggest.
- Choose the beats (p) so that the video lasts 61 to 95 seconds; the checker tells you the length.

How to get facts (this is the reliable method; summaries of web pages proved wrong):
  curl -s -A "football-races-3d-data/1.0" "https://en.wikipedia.org/w/index.php?title=<Page_Title>&action=raw" -o /tmp/p.wiki
then parse the wikitext tables with python3. Always compare your totals with the page's own summary or total rows and
assert they are equal in your script. For anything that changes during the season (current goals, current season), also
check one other reliable source with WebSearch, and write "as of <date>" in the foot line. If the sources disagree and
you cannot settle it, skip the topic and report it.
Keep it accurate and neutral: no insults, no rumours, no betting, no politics, nothing about players' private lives.

STEP 3 - Validate.
Run: python3 src/check_data.py data/topics/<each new file>
It checks the rules of each format and really builds the video. Fix every problem and run it again until all are OK.

STEP 4 - Save.
Only commit data/topics/*.json. Never change src/, engine/, plan/, config.json, state.json, state/, .github/ or assets/.
git add data/topics
git commit -m "Data for topics <first n> to <last n>"
git pull --rebase origin main
git push origin main
If pushing to main is refused, push to a new branch instead and say so clearly in your final message.

FINAL MESSAGE: the topics written (n, date, title), the sources used, the topics skipped and why, and the date until
which data is now ready (from check_data.py --todo).
