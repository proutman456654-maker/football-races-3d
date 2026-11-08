"""Download the Pixabay music and the sound effects listed in assets/music/moods.json (skips files already here).

They stay out of the public repo (.gitignore): the Pixabay license forbids passing a file on as it is.
Usage: python src/fetch_audio.py
"""
import sys
import urllib.request

from common import ROOT, load_json

MUSIC = ROOT / "assets" / "music"
SFX = ROOT / "assets" / "sfx"


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (football-races-3d render job)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if len(data) < 10_000:
        raise SystemExit(f"Download too small, probably not an audio file: {url}")
    dest.write_bytes(data)
    print(f"downloaded {dest.name} ({len(data) // 1024} KB)")


def main():
    moods = load_json(MUSIC / "moods.json", {})
    SFX.mkdir(parents=True, exist_ok=True)
    for folder, urls in ((MUSIC, moods.get("urls", {})), (SFX, moods.get("sfx_urls", {}))):
        for name, url in urls.items():
            if not (folder / name).exists():
                download(url, folder / name)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
