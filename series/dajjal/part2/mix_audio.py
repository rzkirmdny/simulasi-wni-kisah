"""Mix akhir: VO + SFX + skoring (musik di-duck saat ada VO), lalu tempel ke video.

  python mix_audio.py VIDEO.mp4 [MUSIK.mp3] OUT.mp4
Video tidak di-encode ulang (-c:v copy).
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VO = ROOT / "vo_part2.wav" if (ROOT / "vo_part2.wav").exists() else ROOT.parent / "part1" / "vo_part2.wav"  # dibuat oleh part1/build_vo.py
video, out = sys.argv[1], sys.argv[-1]
music = sys.argv[2] if len(sys.argv) == 4 else None

inputs = ["-i", video, "-i", str(VO), "-i", str(ROOT / "sfx_part2.wav")]
fc = ("[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0,asplit=2[vo][key];"
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.42[sfx];")
if music:
    inputs += ["-i", music]
    fc += ("[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.32,afade=t=out:st=95.1:d=3[mus];"
           "[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[musd];"
           "[vo][sfx][musd]amix=inputs=3:normalize=0,")
else:
    fc += "[key]anullsink;[vo][sfx]amix=inputs=2:normalize=0,"
fc += "loudnorm=I=-14:TP=-1.5:LRA=11[a]"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc,
                "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                "-movflags", "+faststart", out], check=True)
print("selesai:", out)
