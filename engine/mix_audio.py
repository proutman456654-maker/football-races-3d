"""Montage sonore v2 : musique filtrée avant les grands moments, coups calés sur la pulsation, compression par les coups.
Écrit assets/mix.m4a autour de -14 LUFS sans écraser les nuances (gain fixe + limiteur, pas de loudnorm dynamique)."""
import glob
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
data = json.load(open("data.json", encoding="utf-8"))
tm = json.load(open("timing.json", encoding="utf-8"))
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# sons : ceux du dépôt (téléchargés par src/fetch_audio.py), sinon ceux de HyperFrames installés sur le PC
_candidates = [os.path.join(REPO, "assets", "sfx")] + sorted(glob.glob(os.path.expanduser(r"~\AppData\Local\npm-cache\_npx\*\node_modules\hyperframes\dist\skills\media-use\audio\assets\sfx")))
sfx_dir = next((d for d in _candidates if os.path.exists(os.path.join(d, "riser.mp3"))), None)
if not sfx_dir:
    raise SystemExit("Sons introuvables : lancer python src/fetch_audio.py")


def music_path(p):
    """Le chemin écrit dans les données, sinon le même fichier dans assets/music du dépôt."""
    if os.path.exists(p):
        return p
    q = os.path.join(REPO, "assets", "music", os.path.basename(p))
    if os.path.exists(q):
        return q
    raise SystemExit(f"Musique introuvable : {p} (lancer python src/fetch_audio.py)")
IMP1 = os.path.join(sfx_dir, "impact-bass-1.mp3")
IMP2 = os.path.join(sfx_dir, "impact-bass-2.mp3")
POP = os.path.join(sfx_dir, "pop.mp3")
RISER = os.path.join(sfx_dir, "riser.mp3")
total = tm["total"]
SR = 48000


def peak_of(path):
    """Instant du pic du fichier, pour que le coup tombe une image après l'image."""
    r = subprocess.run(f'npx hyperframes audio "{path}" --only moments --json', shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        return float(json.loads(r.stdout)["items"][0]["moments"]["peak"])
    except Exception:
        return 0.0


# pics mesurés une fois sur ces fichiers (HyperFrames 0.9.23) : plus besoin de relancer l'analyse à chaque vidéo
KNOWN_PEAKS = {"impact-bass-1.mp3": 0.073, "impact-bass-2.mp3": 1.986, "pop.mp3": 0.12}
PEAK = {p: KNOWN_PEAKS.get(os.path.basename(p)) or peak_of(p) for p in (IMP1, IMP2, POP)}
riser_len = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", RISER], capture_output=True, text=True).stdout.strip())
print("pics", {os.path.basename(k): round(v, 3) for k, v in PEAK.items()}, "montée", round(riser_len, 2))

inputs = ["-ss", f"{tm['offset']:.3f}", "-t", f"{total + 1:.3f}", "-i", music_path(data["music"]["file"])]
filters = []
hits = []
uses = {}  # chaque fichier son n'est ouvert qu'une fois, puis dupliqué dans le graphe


def add(path, when, gain, name, rate=1.0, short=None, grit=False, start=False):
    """when = instant où le pic du son doit tomber (ou son début si start). short = longueur gardée, grit = harmoniques pour les téléphones."""
    pk = 0.0 if start else PEAK.get(path, 0.0) / rate
    if short:
        pk = min(pk, 0.05)
    ms = max(0, int(round((when - pk) * 1000)) + (0 if start else 33))
    chain = ""
    if rate != 1.0:
        chain += f"asetrate={int(SR * rate)},aresample={SR},"
    if short:
        chain += f"atrim=0:{short},afade=t=out:st={short * 0.2:.3f}:d={short * 0.8:.3f},"
    if grit:
        chain += "volume=7dB,asoftclip=type=tanh,volume=-5dB,"
    chain += f"volume={gain},aformat=sample_rates={SR}:channel_layouts=stereo,adelay={ms}|{ms}"
    uses.setdefault(path, []).append((name, chain))
    hits.append(f"[{name}]")


# Trois prises en rotation pour que le même coup ne revienne jamais à l'identique.
TAKES = [(IMP1, 0.44, 1.0), (IMP2, 0.36, 1.0), (IMP1, 0.38, 1.16)]
k = 0
for n, e in enumerate(tm["events"]):
    if e.get("soft"):
        # atterrissage des billes : un coup sourd et court, plus discret qu'un titre
        add(IMP2, e["L"], 0.22, f"s{n}", 1.25, short=0.45)
        continue
    if e["big"]:
        add(IMP1, e["L"], 0.62, f"a{n}", grit=True)
        add(IMP2, e["L"], 0.34, f"b{n}", 0.86)
        add(POP, e["L"], 0.5, f"k{n}", 0.8)
    else:
        path, gain, rate = TAKES[k % 3]
        add(path, e["L"], gain, f"a{n}", rate, short=0.85, grit=True)
        add(POP, e["L"], 0.34, f"k{n}", [1.0, 0.86, 1.12][k % 3])
        k += 1
    if e["hasNote"]:
        add(POP, e["L"] + 0.22, 0.16, f"p{n}", 1.25)

# Chocs de billes : seulement les plus forts, choisis par le format
CLICK = os.path.join(sfx_dir, "click-soft.mp3")
CLICK2 = os.path.join(sfx_dir, "click.mp3")
for n, e in enumerate(tm.get("sfx", [])):
    s = float(e.get("s", 0.5))
    if e["kind"] == "clack":
        add(CLICK2, e["t"], 0.18 + 0.3 * s, f"x{n}", 0.9 + 0.25 * (n % 3) / 2)
    elif e["kind"] == "bump":
        add(POP, e["t"], 0.16 + 0.22 * s, f"x{n}", 1.35)
    else:
        add(CLICK, e["t"], 0.12 + 0.2 * s, f"x{n}", 0.8)

# Une seule montée dans le film, vers le moment le plus fort choisi par le format.
riser_at = tm.get("riser") or tm["events"][-1]["L"]
add(RISER, riser_at - riser_len, 0.34, "r0", start=True)
add(IMP1, tm["tEnd"], 0.6, "e0", grit=True)

for i, (path, lst) in enumerate(uses.items(), start=1):
    inputs.extend(["-i", path])
    outs = "".join(f"[u{i}_{k}]" for k in range(len(lst)))
    filters.append(f"[{i}:a]aresample={SR},aformat=sample_rates={SR}:channel_layouts=stereo," + (f"asplit={len(lst)}{outs}" if len(lst) > 1 else f"anull{outs}"))
    for k, (name, chain) in enumerate(lst):
        filters.append(f"[u{i}_{k}]{chain}[{name}]")

# La musique se retient avant chaque grand impact : passe-bas et baisse, puis tout revient sur le coup.
parts = []
for e in tm["events"]:
    if e["big"]:
        a = e["L"] - e["fall"]
        b = e["L"]
        parts.append((a, b))
expr = "0"
for a, b in reversed(parts):
    expr = f"if(between(t,{a:.3f},{b:.3f}),min((t-{a:.3f})/0.35,1),{expr})"
filters.append(
    f"[0:a]atrim=0:{total:.3f},asetpts=N/SR/TB,aresample={SR},afade=t=out:st={total - 1.5:.3f}:d=1.5,bass=g=-2:f=80,treble=g=5:f=1400,loudnorm=I=-17:TP=-2:LRA=9,asplit[md][mw];"
    f"[md]volume='1-0.92*({expr})':eval=frame[mdo];"
    f"[mw]lowpass=f=520,volume='0.95*({expr})':eval=frame[mwo];"
    f"[mdo][mwo]amix=inputs=2:normalize=0[music]"
)
n_hits = len(hits)
NS = int(round(total * SR))
# horloge remise à zéro puis longueur forcée en échantillons : la piste des coups dure exactement le film
filters.append("".join(hits) + f"amix=inputs={n_hits}:normalize=0:duration=longest,asetpts=N/SR/TB,apad=whole_len={NS},atrim=end_sample={NS},asetpts=N/SR/TB,asplit=2[hmix][hsc]")
filters.append("[music][hsc]sidechaincompress=threshold=0.09:ratio=4:attack=4:release=170:makeup=1[pumped]")
filters.append(f"[pumped][hmix]amix=inputs=2:normalize=0:duration=first,aformat=sample_rates={SR}:channel_layouts=stereo,asetpts=N/SR/TB,apad=whole_len={NS},atrim=end_sample={NS}[mixed]")

os.makedirs("assets", exist_ok=True)
tmp = "assets/_mix_raw.wav"
graph = "assets/_graph.txt"
open(graph, "w", encoding="utf-8").write(";\n".join(filters))
# FFmpeg 7+ lit le graphe dans un fichier avec « -/filter_complex » ; FFmpeg 6 (celui de GitHub) avec « -filter_complex_script »
_ver = re.search(r"ffmpeg version n?(\d+)", subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout)
_graph_opt = "-/filter_complex" if _ver and int(_ver.group(1)) >= 7 else "-filter_complex_script"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error"] + inputs + [_graph_opt, graph, "-map", "[mixed]", "-c:a", "pcm_f32le", "-ar", str(SR), tmp], check=True, stdin=subprocess.DEVNULL)
os.remove(graph)


def lufs(path, af="anull"):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", af + ",ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    i = re.findall(r"I:\s*(-?[\d.]+) LUFS", r.stderr)
    p = re.findall(r"Peak:\s*(-?[\d.]+) dBFS", r.stderr)
    return float(i[-1]), float(p[-1]) if p else None


i0, p0 = lufs(tmp)
limiter = "alimiter=limit=0.84:attack=3:release=70:level=disabled"
gain = -14 - i0
for _ in range(3):
    i1, p1 = lufs(tmp, f"volume={gain:.2f}dB,{limiter}")
    gain += -14 - i1
print(f"brut {i0:.1f} LUFS, gain {gain:.2f} dB")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", f"volume={gain:.2f}dB,{limiter}", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "assets/mix.m4a"], check=True)
os.remove(tmp)
i2, p2 = lufs("assets/mix.m4a")
print(f"mix ok : {i2:.1f} LUFS, crête {p2} dB, {n_hits} pistes, {os.path.getsize('assets/mix.m4a')} octets")
