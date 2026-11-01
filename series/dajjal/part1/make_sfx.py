"""SFX Part 1, disintesis sendiri (numpy), ditaruh sesuai waktu adegan di scene.js.

Hasil: sfx_part1.wav (48 kHz stereo), panjang = durasi video.
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent
SR = 48000
d = json.loads((ROOT / "web" / "data_part1.json").read_text())
DUR = d["duration"]
L = {l["line"]: l for l in d["lines"]}
CAPS = d["captions"]
rng = np.random.default_rng(7)


def cap(line, sub):
    for c in CAPS:
        if c["start"] >= L[line]["start"] - 0.01 and sub in c["text"]:
            return c["start"]
    return L[line]["start"]


N = int(DUR * SR) + SR
mix = np.zeros((N, 2))


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def env(n, a=0.01, r=0.2):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def put(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if sig.ndim == 1:
        sig = np.stack([sig * (1 - max(0, pan)), sig * (1 + min(0, pan))], 1)
    j = min(N, i + len(sig))
    if i < N:
        mix[i:j] += sig[: j - i] * gain


def bed(t0, t1, gen, gain, fade=1.0):
    n = int((t1 - t0) * SR)
    s = gen(n)
    e = np.ones(n); f = min(n // 2, int(fade * SR))
    e[:f] = np.linspace(0, 1, f); e[-f:] *= np.linspace(1, 0, f)
    put(s * e[:, None] if s.ndim == 2 else s * e, t0, gain)


noise = lambda n: rng.standard_normal(n)
st = lambda f, n: np.stack([f(n), f(n)], 1)  # dua kanal acak = stereo lebar
tt = lambda n: np.arange(n) / SR


# ---- generator suara ----
def boom(dur=2.5, f0=48):
    n = int(dur * SR); t = tt(n)
    s = np.sin(2 * np.pi * (f0 * t - 10 * t * t)) * np.exp(-t * 1.6)
    s += lp(noise(n), 120) * np.exp(-t * 2.5) * 0.8
    return s * env(n, 0.005, 0.5)


def chain(dur=1.2, hits=7):
    n = int(dur * SR); s = np.zeros(n)
    for k in range(hits):
        i = int(rng.uniform(0, dur - 0.15) * SR); m = int(0.12 * SR); t = tt(m)
        tone = sum(np.sin(2 * np.pi * f * t) for f in rng.uniform(2200, 5200, 3))
        s[i:i + m] += (tone / 3 + hp(noise(m), 3000) * 0.6) * np.exp(-t * 45) * rng.uniform(0.4, 1)
    return s


def click():
    n = int(0.06 * SR); t = tt(n)
    return (hp(noise(n), 1500) * np.exp(-t * 120) + np.sin(2 * np.pi * 900 * t) * np.exp(-t * 90) * 0.5)


def match():
    n = int(0.9 * SR); t = tt(n)
    scrape = bp(noise(n), 1500, 7000) * np.exp(-((t - 0.12) / 0.07) ** 2)
    flare = bp(noise(n), 300, 3000) * np.exp(-np.maximum(0, t - 0.18) * 4) * (t > 0.15)
    return scrape * 0.9 + flare * 0.5


def whoosh(dur=1.4, up=True):
    n = int(dur * SR); t = tt(n); k = t / dur
    s = np.zeros(n); x = noise(n)
    for a, b in [(0, .33), (.33, .66), (.66, 1.0)]:  # sapuan frekuensi kasar
        m = (k >= a) & (k < b)
        lo = 200 + 1800 * (a if up else 1 - b)
        s[m] = bp(x, lo, lo * 3)[m]
    return s * np.sin(np.pi * k) ** 2


def rain(n):
    return st(lambda m: bp(noise(m), 2000, 9000) * 0.6 + bp(noise(m), 400, 1500) * 0.25, n)


def crickets(n):
    t = tt(n); s = np.zeros(n)
    for f, rate, ph in [(4300, 2.1, 0), (4800, 1.7, .4)]:
        gate = (np.sin(2 * np.pi * rate * t + ph) > 0.6) * (np.sin(2 * np.pi * 28 * t) > 0)
        s += np.sin(2 * np.pi * f * t) * gate * 0.3
    return st(lambda m: lp(s, 6000), n)


def wind(n, lo=150, hi=900):
    t = tt(n); m = 0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t) * np.sin(2 * np.pi * 0.07 * t + 1)
    return st(lambda k: bp(noise(k), lo, hi) * m, n)


def surf(n, period=6.0, rough=1.0):
    t = tt(n); sw = (0.5 + 0.5 * np.sin(2 * np.pi * t / period - np.pi / 2)) ** 2
    return st(lambda k: (lp(noise(k), 900 + 1500 * rough) * (0.35 + sw)), n)


def thunder():
    n = int(4 * SR); t = tt(n)
    crack = hp(noise(n), 800) * np.exp(-t * 12) * 0.8
    roll = lp(noise(n), 160) * np.exp(-t * 0.9) * (1 + 0.5 * np.sin(2 * np.pi * 3 * t)) * 2.2
    return crack + roll


def creak(dur=1.6, f0=95, f1=60):
    n = int(dur * SR); t = tt(n); k = t / dur
    f = f0 + (f1 - f0) * k + 12 * np.sin(2 * np.pi * 7 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = ((ph / (2 * np.pi)) % 1) * 2 - 1
    pulses = (np.sin(2 * np.pi * 23 * t) > 0.2)  # stick-slip
    s = bp(saw * pulses, 300, 2500) + bp(saw, 80, 400) * 0.4
    return s * env(n, 0.1, 0.4)


def steps(dur, rate, gain=1.0):
    n = int(dur * SR); s = np.zeros(n); m = int(0.08 * SR); tm = tt(m)
    step = (lp(noise(m), 500) + bp(noise(m), 1500, 4000) * 0.3) * np.exp(-tm * 50)
    t = 0.0
    while t < dur - 0.1:
        i = int(t * SR); s[i:i + m] += step * rng.uniform(0.6, 1)
        t += 1 / rate * rng.uniform(0.85, 1.15)
    return s * gain


def growl(dur=2.5):
    n = int(dur * SR); t = tt(n)
    f = 55 + 8 * np.sin(2 * np.pi * 3.3 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 11 * t))
    s += bp(noise(n), 80, 400) * 0.5
    return lp(s, 400) * env(n, 0.6, 0.8)


def sting(dur=2.5):
    n = int(dur * SR); t = tt(n)
    s = sum(np.sin(2 * np.pi * f * t) for f in (220, 233.1, 329.6)) / 3  # cluster tegang
    return s * np.exp(-t * 1.2) * env(n, 0.002, 0.6)


def drone(n, f=55):
    t = tt(n)
    s = sum(np.sin(2 * np.pi * (f * h) * t + h) / h for h in (1, 2, 3.01))
    return st(lambda k: s * (0.7 + 0.3 * np.sin(2 * np.pi * 0.2 * t)), n)


# ---- waktu adegan (sama dengan scene.js) ----
T = lambda k: L[k]["start"]
E = lambda k: L[k]["end"]
tLamp = T("03_narator_langgar") - 0.9
tChain = cap("02_narator_janji", "Dirantai")
tHand = E("06_abah_kisahasli") + 0.1
tM, tB, tS, tJ, tR = T("07_narator_madinah"), T("08_narator_badai"), T("09_tamim_sekoci"), T("10_jassasah"), T("11_tamim_takutsetan")
tMonth = cap("08_narator_badai", "Sebulan"); tSunset = cap("08_narator_badai", "Sampai")
tBeast = cap("09_tamim_sekoci", "Lalu muncul"); tAsk = cap("09_tamim_sekoci", "Kami bertanya")
tGo = cap("10_jassasah", "Pergilah"); tHurry = cap("11_tamim_takutsetan", "Kami bergegas")
tD = E("11_tamim_takutsetan") + 0.25; tOpen = tD + 0.2

# 1) hook
put(boom(3.0), 0.0, 0.9)
put(chain(1.6, 9), 0.25, 0.25, -0.3)
put(chain(1.2, 6), 2.4, 0.18, 0.3)
bed(0, T("02_narator_janji") + 0.5, lambda n: drone(n, 41), 0.10, 0.4)
# 2) pulau malam
bed(T("02_narator_janji"), tLamp, lambda n: surf(n, 7, 0.5), 0.10, 0.8)
bed(T("02_narator_janji"), tLamp, lambda n: wind(n, 200, 700), 0.05, 0.8)
put(chain(1.4, 8), tChain, 0.22, 0.2)
# 3) langgar
put(click(), tLamp + 0.02, 0.5)
put(match(), tLamp + 0.5, 0.45, 0.15)
bed(tLamp + 0.1, tM + 0.4, rain, 0.06, 0.6)
bed(tLamp + 0.1, tM + 0.4, crickets, 0.04, 0.6)
put(whoosh(1.5, True), tHand + 0.1, 0.35)
put(boom(1.8, 60), tM - 0.15, 0.45)
# 4) Madinah
bed(tM, tB, lambda n: wind(n, 150, 600), 0.06, 1.0)
put(steps(6.5, 3.2, 0.12), tM + 0.3, 1.0)
put(whoosh(1.2, False), cap("07_narator_madinah", "Selesai shalat") - 0.5, 0.18)
put(sting(3.0), cap("07_narator_madinah", "Tamim"), 0.06)
# 5) badai
bed(tB, tS, lambda n: surf(n, 3.0, 1.0), 0.16, 0.8)
bed(tB, tSunset + 2.5, rain, 0.09, 0.8)
bed(tB, tSunset + 1.5, lambda n: wind(n, 300, 1600), 0.10, 0.8)
for ft in [tB + 3.2, tB + 6.9, tMonth + 1.5, tMonth + 3.6]:
    put(thunder(), ft, 0.5, rng.uniform(-0.4, 0.4))
for k in range(5):
    put(creak(1.4, 80 + 10 * k, 55), tB + 1.5 + k * 3.3, 0.12, -0.2)
# 6) pantai + makhluk
bed(tS, tJ, lambda n: surf(n, 5.0, 0.4), 0.10, 0.6)
put(lp(noise(int(0.3 * SR)), 300) * np.exp(-tt(int(0.3 * SR)) * 15), tS + 2.6, 0.5)  # sekoci mendarat
put(steps(2.6, 3.5, 0.15), tS + 2.8, 1.0)
put(bp(noise(int(1.6 * SR)), 1500, 6000) * env(int(1.6 * SR), 0.1, 0.6), tBeast, 0.22, 0.4)  # semak bergoyang
put(growl(2.6), tBeast + 0.4, 0.55)
put(sting(2.5), tAsk + 1.0, 0.07)
# 7) Al-Jassasah
bed(tJ, tR, lambda n: wind(n, 100, 500), 0.08, 0.8)
bed(tJ, tR, lambda n: drone(n, 49), 0.07, 0.8)
put(whoosh(1.2, True), tGo, 0.15)
# 8) bergegas
bed(tR, tD, lambda n: wind(n, 200, 900), 0.06, 0.5)
put(steps(tD - tHurry + 0.3, 6.5, 0.2), tHurry - 0.3, 1.0)
# 9) pintu biara
put(creak(1.7, 110, 58), tOpen, 0.55)
put(chain(1.4, 8), tOpen + 1.4, 0.35, -0.2)
put(boom(3.0, 40), tOpen + 2.0, 0.9)
put(sting(3.0), tOpen + 2.0, 0.12)

out = mix[: int(DUR * SR)]
out = out / max(1e-9, np.abs(out).max()) * 0.9
wavfile.write(ROOT / "sfx_part1.wav", SR, (out * 32767).astype(np.int16))
print("sfx_part1.wav", round(len(out) / SR, 2), "s")
