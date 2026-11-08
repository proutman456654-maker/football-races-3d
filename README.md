# Football Races 3D

Automated football channel (TikTok + Instagram, in English): 3D title races, duels, top 10s and marble tournaments,
rendered in code with HyperFrames and three.js, two videos a day at 21:00 and 02:00 Paris time.

- `plan/` the year plan (730 topics) and the script that makes it
- `data/topics/` one checked data file per topic, written before its day
- `engine/` the 3D engine (formats, world, flags from flag-icons, MIT)
- `src/` make a video, schedule it on Zernio, Telegram alerts
- `.github/workflows/` the daily render and the post checks

Keys live in `.env` on the PC and in the repository Secrets on GitHub, never in a file of this repository.
Pixabay music is downloaded at render time and never stored here.
