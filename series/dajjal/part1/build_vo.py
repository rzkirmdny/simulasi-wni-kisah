"""Susun VO seri Dajjal jadi track per part.

Tiap baris: potong hening di awal/akhir, samakan loudness, lalu taruh di
timeline dengan jeda yang diatur per baris. Hasil: vo_partN.wav,
vo_partN.mp3 (preview) dan timeline_partN.json (dipakai saat build visual).
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VO = ROOT / "vo"
CLEAN = VO / "clean"
CLEAN.mkdir(exist_ok=True)
SR = 48000

# (file, peran, jeda SEBELUM baris ini dalam detik)
# Jeda pendek = tanya-jawab, jeda panjang = pindah adegan / momen dramatis.
PARTS = {
    1: {
        "lines": [
            ("01_dajjal_hook", "DAJJAL", 0.4),
            ("02_narator_janji", "NARATOR", 0.6),
            ("03_narator_langgar", "NARATOR", 1.4),   # klik lampu padam, korek
            ("04_raka_bermuda", "RAKA", 0.4),
            ("05_nisa_matilampu", "NISA", 0.3),
            ("06_abah_kisahasli", "ABAH", 0.6),
            ("07_narator_madinah", "NARATOR", 1.6),   # bayangan jadi layar wayang
            ("08_narator_badai", "NARATOR", 1.0),     # ombak masuk
            ("09_tamim_sekoci", "TAMIM", 1.0),
            ("10_jassasah", "AL-JASSASAH", 0.8),
            ("11_tamim_takutsetan", "TAMIM", 0.6),
        ],
        "tail": 4.0,  # pintu biara berderit, rantai, mata berkilat, teks Part 2
    },
    2: {
        "lines": [
            ("01_dajjal_hook", "DAJJAL", 0.4),
            ("12_narator_berantai", "NARATOR", 1.2),
            ("13_dajjal_baisan", "DAJJAL", 0.8),
            ("14_tamim_masih", "TAMIM", 0.4),
            ("15_dajjal_thabariyah", "DAJJAL", 0.4),
            ("16_tamim_airbanyak", "TAMIM", 0.4),
            ("17_dajjal_airhabis", "DAJJAL", 0.5),
            ("18_narator_zughar", "NARATOR", 0.9),
            ("19_dajjal_pengakuan", "DAJJAL", 1.2),   # zoom ke mata
            ("20_narator_thaibah", "NARATOR", 1.6),   # ketukan tongkat 3x
            ("21_raka_gantung", "RAKA", 1.4),         # kembali ke langgar
            ("22_narator_gantung", "NARATOR", 0.6),
        ],
        "tail": 3.0,
    },
}


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def clean(name):
    src = VO / f"{name}.mp3"
    dst = CLEAN / f"{name}.wav"
    if not dst.exists():
        # potong hening awal & akhir, lalu samakan loudness ke -18 LUFS
        af = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
              "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,"
              "areverse,loudnorm=I=-18:TP=-2:LRA=11")
        run(["ffmpeg", "-y", "-i", str(src), "-af", af, "-ar", str(SR), "-ac", "1", str(dst)])
    return dst


def build(n, spec):
    t = 0.0
    timeline, inputs, delays = [], [], []
    for i, (name, role, gap) in enumerate(spec["lines"]):
        t += gap
        wav = clean(name)
        d = duration(wav)
        timeline.append({"line": name, "role": role, "start": round(t, 3), "end": round(t + d, 3)})
        inputs += ["-i", str(wav)]
        delays.append(f"[{i}:a]adelay={int(t * 1000)}:all=1[a{i}]")
        t += d
    total = round(t + spec["tail"], 3)
    mix = ";".join(delays) + ";" + "".join(f"[a{i}]" for i in range(len(delays))) + \
        f"amix=inputs={len(delays)}:normalize=0,apad=whole_dur={total}[out]"
    out_wav = ROOT / f"vo_part{n}.wav"
    run(["ffmpeg", "-y", *inputs, "-filter_complex", mix, "-map", "[out]",
         "-ar", str(SR), "-ac", "1", str(out_wav)])
    run(["ffmpeg", "-y", "-i", str(out_wav), "-b:a", "128k", str(ROOT / f"vo_part{n}.mp3")])
    (ROOT / f"timeline_part{n}.json").write_text(
        json.dumps({"part": n, "duration": total, "lines": timeline}, indent=2, ensure_ascii=False))
    return total, timeline


if __name__ == "__main__":
    for n, spec in PARTS.items():
        total, tl = build(n, spec)
        print(f"Part {n}: {total:.2f} s ({int(total // 60)}:{total % 60:05.2f})")
        for row in tl:
            print(f"  {row['start']:7.2f}  {row['end']:7.2f}  {row['role']:<12} {row['line']}")
