"""Render halaman wayang (web/index.html) jadi video, frame per frame lewat __seek(t).

Pakai:
  python render.py stills 2.0 20 45            # cek frame tertentu -> stills/
  python render.py video --part 1              # render penuh + VO -> out/part1.mp4
  python render.py video --part 1 --gpu        # Colab: Chrome pakai GPU (Vulkan/ANGLE)

Tiap adegan jadi satu file mp4 (out/part1_seg_XX.mp4), lalu digabung dengan
concat demuxer -c copy dan diberi suara -c:v copy.
"""
import argparse
import http.server
import json
import os
import socketserver
import subprocess
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
FPS = 30


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = lambda *a, **k: Quiet(*a, directory=str(ROOT), **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def browser(p, gpu):
    args = ["--force-device-scale-factor=1", "--hide-scrollbars"]
    if os.environ.get("GL_ARGS"):
        args += json.loads(os.environ["GL_ARGS"])
    elif gpu:
        args += ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]
    else:
        args += ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    exe = "/usr/bin/google-chrome" if Path("/usr/bin/google-chrome").exists() else None
    kw = {"channel": "chromium"} if os.environ.get("HEADLESS_NEW") else {}
    b = p.chromium.launch(executable_path=exe, args=args, **kw)
    page = b.new_page(viewport={"width": 1080, "height": 1920})
    page.on("pageerror", lambda e: print("PAGE ERROR:", e))
    page.on("console", lambda m: m.type == "error" and print("CONSOLE:", m.text))
    return b, page


def open_page(page, port, part):
    page.goto(f"http://127.0.0.1:{port}/web/index.html?part={part}")
    page.wait_for_function("window.__ready === true", timeout=60000)


def shot(page, t):
    page.evaluate(f"window.__seek({t})")
    return page.locator("#stage").screenshot(type="jpeg", quality=92)


def segments(part):
    """Batas adegan = awal baris yang memulai adegan baru (sama dengan scene.js)."""
    d = json.loads((ROOT / "web" / f"data_part{part}.json").read_text())
    starts = {l["line"]: l["start"] for l in d["lines"]}
    if part == 1:
        cuts = [0, starts["02_narator_janji"], starts["03_narator_langgar"] - 0.9, starts["07_narator_madinah"],
                starts["08_narator_badai"], starts["09_tamim_sekoci"], starts["10_jassasah"],
                starts["11_tamim_takutsetan"], d["duration"]]
    else:
        cuts = [0, d["duration"]]
    return cuts, d["duration"]


def render_video(part, gpu, only=None):
    out = ROOT / "out"; out.mkdir(exist_ok=True)
    cuts, dur = segments(part)
    total = int(round(dur * FPS))
    frames = [round(c * FPS) for c in cuts[:-1]] + [total]
    httpd, port = serve()
    with sync_playwright() as p:
        b, page = browser(p, gpu)
        open_page(page, port, part)
        files = []
        for i in range(len(frames) - 1):
            f0, f1 = frames[i], frames[i + 1]
            final = out / f"part{part}_seg_{i:02d}.mp4"
            files.append(final)
            if only is not None and i not in only and final.exists():
                continue
            tmp = out / f"part{part}_seg_{i:02d}.tmp.mp4"
            enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS),
                                    "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                                    "-pix_fmt", "yuv420p", "-r", str(FPS), str(tmp)], stdin=subprocess.PIPE)
            for f in range(f0, f1):
                enc.stdin.write(shot(page, f / FPS))
            enc.stdin.close()
            if enc.wait() == 0:
                tmp.rename(final)
                print(f"seg {i}: frame {f0}-{f1} ok")
            else:
                raise SystemExit(f"seg {i} gagal")
        b.close()
    httpd.shutdown()
    lst = out / f"part{part}_list.txt"
    lst.write_text("".join(f"file '{f.name}'\n" for f in files))
    silent = out / f"part{part}_silent.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)], check=True)
    final = out / f"part{part}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(ROOT / f"vo_part{part}.wav"),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(final)], check=True)
    print("selesai:", final)


def render_stills(part, times, gpu):
    out = ROOT / "stills"; out.mkdir(exist_ok=True)
    httpd, port = serve()
    with sync_playwright() as p:
        b, page = browser(p, gpu)
        open_page(page, port, part)
        for t in times:
            (out / f"p{part}_{t:07.2f}.jpg").write_bytes(shot(page, t))
        b.close()
    httpd.shutdown()


def render_chunk(part, lo, hi, out_file, port_hint=0):
    """Render frame lo..hi (inklusif) ke satu mp4. Dipakai worker paralel di Colab."""
    out_file = Path(out_file)
    if out_file.exists():
        print("lewati, sudah ada:", out_file); return
    tmp = out_file.with_suffix(".tmp.mp4")
    httpd, port = serve()
    with sync_playwright() as p:
        b, page = browser(p, False)
        open_page(page, port, part)
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS),
                                "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                                "-pix_fmt", "yuv420p", "-r", str(FPS), str(tmp)], stdin=subprocess.PIPE)
        for f in range(lo, hi + 1):
            enc.stdin.write(shot(page, f / FPS))
            if f % 60 == 0:
                print("frame", f, flush=True)
        enc.stdin.close()
        b.close()
    httpd.shutdown()
    if enc.wait() != 0:
        raise SystemExit("encode gagal")
    tmp.rename(out_file)


def probe(part, t):
    import time
    httpd, port = serve()
    with sync_playwright() as p:
        b, page = browser(p, False)
        open_page(page, port, part)
        r = page.evaluate("""() => { const g = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl');
          const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); }""")
        print("RENDERER", r)
        shot(page, t); t0 = time.time()
        for i in range(10):
            shot(page, t + i / FPS)
        print(f"detik/frame {(time.time() - t0) / 10:.3f}")
        (ROOT / "probe.jpg").write_bytes(shot(page, t))
        b.close()
    httpd.shutdown()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "chunk":
        part, lo, hi, out = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
        render_chunk(part, lo, hi, out); raise SystemExit
    if len(sys.argv) > 1 and sys.argv[1] == "probe":
        probe(int(sys.argv[2]), float(sys.argv[3])); raise SystemExit
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["stills", "video"])
    ap.add_argument("times", nargs="*", type=float)
    ap.add_argument("--part", type=int, default=1)
    ap.add_argument("--gpu", action="store_true")
    ap.add_argument("--only", type=int, nargs="*")
    a = ap.parse_args()
    if a.mode == "stills":
        render_stills(a.part, a.times, a.gpu)
    else:
        render_video(a.part, a.gpu, set(a.only) if a.only else None)
