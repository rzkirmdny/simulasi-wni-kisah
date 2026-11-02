"""Bikin zip render Colab untuk satu part seri Dajjal.

  python series/dajjal/make_zip.py 3        # -> dist/dajjal-part3.zip

Isi zip (folder dajjal-partN/): render.py, mix_audio.py, make_sfx.py, web/,
vo_partN.wav, sfx_partN.wav, score.mp3. Dipakai oleh colab_render.ipynb (satu notebook
untuk semua part, cukup ganti PART).

- vo_partN.wav dibuat ulang lewat part1/build_vo.py kalau belum ada.
- sfx_partN.wav dibuat ulang lewat partN/make_sfx.py kalau belum ada atau lebih tua dari skripnya.
- score.mp3: partN/score.mp3 kalau ada, kalau tidak pakai part1/score_part1.mp3.
"""
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE.parents[1] / "dist"


def main(n):
    part = HERE / f"part{n}"
    if not part.is_dir():
        raise SystemExit(f"folder {part} belum ada")
    vo = part / f"vo_part{n}.wav"
    if not vo.exists():
        vo = HERE / "part1" / f"vo_part{n}.wav"
    if not vo.exists():
        print("membuat VO...")
        subprocess.run([sys.executable, "build_vo.py"], cwd=HERE / "part1", check=True, stdout=subprocess.DEVNULL)
    sfx, sfx_py = part / f"sfx_part{n}.wav", part / "make_sfx.py"
    if not sfx.exists() or (sfx_py.exists() and sfx_py.stat().st_mtime > sfx.stat().st_mtime):
        print("membuat SFX...")
        subprocess.run([sys.executable, "make_sfx.py"], cwd=part, check=True, stdout=subprocess.DEVNULL)
    score = part / "score.mp3"
    if not score.exists():
        score = HERE / "part1" / "score_part1.mp3"

    files = {f"render.py": part / "render.py", "mix_audio.py": part / "mix_audio.py",
             "make_sfx.py": sfx_py, f"vo_part{n}.wav": vo, f"sfx_part{n}.wav": sfx, "score.mp3": score}
    for p in sorted((part / "web").rglob("*")):
        if p.is_file():
            files[str(p.relative_to(part))] = p
    miss = [k for k, p in files.items() if not p.exists()]
    if miss:
        raise SystemExit(f"file hilang: {miss}")

    DIST.mkdir(exist_ok=True)
    out = DIST / f"dajjal-part{n}.zip"
    root = f"dajjal-part{n}"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, p in files.items():
            z.write(p, f"{root}/{name}")
    print(f"{out}  ({out.stat().st_size / 1e6:.1f} MB, {len(files)} file)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(int(sys.argv[1]))
