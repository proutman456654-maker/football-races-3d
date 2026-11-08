"""Make one video from a data file: build the 3D project, mix the sound, render, make the phone copy, check it.

Usage:
    python src/make_video.py data/topics/<id>.json [--quality cpu|draft] [--workers 3]
Writes output/<id>/video.mp4 and output/<id>/check.json. Fails (exit 1) if the video breaks a rule:
under 61 s, sound far from -14 LUFS, or a silence longer than a second.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from common import OUTPUT, ROOT, find_ffmpeg, save_json

HYPERFRAMES = "hyperframes@0.9.23"  # pinned: a new version can't change the look without a test
BUILD = ROOT / "build"
NPX = "npx.cmd" if os.name == "nt" else "npx"


def run(cmd, cwd=None, log=None):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    with open(log, "w", encoding="utf-8") if log else open(os.devnull, "w") as out:
        r = subprocess.run([str(c) for c in cmd], cwd=cwd, stdin=subprocess.DEVNULL,  # sans ça, FFmpeg peut attendre le clavier et bloquer
                           stdout=out if log else None, stderr=subprocess.STDOUT if log else None)
    if r.returncode:
        tail = Path(log).read_text(encoding="utf-8", errors="replace")[-3000:] if log else ""
        raise SystemExit(f"Command failed ({r.returncode}): {cmd[0]} {cmd[1] if len(cmd) > 1 else ''}\n{tail}")


def measure(video, ffmpeg):
    """Duration, integrated loudness and silences of the finished video."""
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip()
    r = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-i", str(video), "-af",
                        "ebur128=framelog=verbose,silencedetect=noise=-45dB:d=1.0", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL)
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    silences = re.findall(r"silence_start: (-?[\d.]+)", r.stderr)
    return {"seconds": round(float(probe), 2), "lufs": float(lufs[-1]) if lufs else None, "silences": [float(s) for s in silences]}


def make(data_file, quality="cpu", workers=3):
    data_file = Path(data_file).resolve()
    vid = data_file.stem
    build = BUILD / vid
    out = OUTPUT / vid
    shutil.rmtree(build, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    run(["node", ROOT / "engine" / "build.mjs", data_file, build, quality])
    run([sys.executable, ROOT / "engine" / "mix_audio.py"], cwd=build, log=out / "mix.log")
    run([NPX, "--yes", HYPERFRAMES, "render", "--no-browser-gpu", "--workers", str(workers), "--crf", "20",
         "--max-bitrate", "14M", "--output", "master.mp4"], cwd=build, log=out / "render.log")
    video = out / "video.mp4"
    run([ffmpeg, "-y", "-v", "error", "-i", build / "master.mp4", "-c:v", "libx264", "-preset", "slow", "-crf", "23",
         "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", video])
    check = measure(video, ffmpeg)
    problems = []
    if check["seconds"] < 61:
        problems.append(f"only {check['seconds']} s (61 s minimum)")
    if check["lufs"] is None or abs(check["lufs"] + 14) > 1.5:
        problems.append(f"loudness {check['lufs']} LUFS (target -14)")
    if check["silences"]:
        problems.append(f"silence at {check['silences']} s")
    check["problems"] = problems
    save_json(out / "check.json", check)
    print(json.dumps(check))
    if problems:
        raise SystemExit("Video refused: " + "; ".join(problems))
    return video, build


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("data")
    ap.add_argument("--quality", default="cpu")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    make(a.data, a.quality, a.workers)
