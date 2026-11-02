"""SFX Part 2, disintesis sendiri (numpy), ditaruh sesuai waktu adegan di web/scene.js.
Generator suara disalin dari part1/make_sfx.py.

Hasil: sfx_part2.wav (48 kHz stereo), panjang = durasi video.
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent
SR = 48000
d = json.loads((ROOT / "web" / "data_part2.json").read_text())
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


def knock():  # ketukan kayu pada mimbar, dengan gaung ruangan
    n = int(1.6 * SR); t = tt(n)
    s = (bp(noise(n), 250, 1400) * np.exp(-t * 60) + np.sin(2 * np.pi * 170 * t) * np.exp(-t * 35) * 0.9)
    out = s.copy()
    for d, g in [(0.09, 0.35), (0.17, 0.25), (0.29, 0.16), (0.43, 0.1), (0.61, 0.06)]:
        i = int(d * SR); out[i:] += lp(s[: n - i], 2500) * g
    return out


def drip():
    n = int(0.12 * SR); t = tt(n)
    f = 1400 - 6000 * t
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)


def thud():
    n = int(0.15 * SR); t = tt(n)
    return lp(noise(n), 250) * np.exp(-t * 35)


def shine(dur=3.5, f=220):  # akor terang, lembut (Makkah, Thaibah)
    n = int(dur * SR); t = tt(n)
    s = sum(np.sin(2 * np.pi * f * r * t) for r in (1, 1.25, 1.5, 2)) / 4
    return s * env(n, 0.8, 1.6)


def crackle(dur=2.0):
    n = int(dur * SR); s = np.zeros(n)
    for _ in range(40):
        i = int(rng.uniform(0, dur - 0.03) * SR); m = int(0.02 * SR)
        s[i:i + m] += hp(noise(m), 2500) * np.exp(-tt(m) * 200) * rng.uniform(0.2, 1)
    return s


# ---- waktu adegan (sama dengan web/scene.js) ----
T = lambda k: L[k]["start"]
E = lambda k: L[k]["end"]
caps_all = lambda sub: [c["start"] for c in CAPS if sub in c["text"]]
tB2 = E("01_dajjal_hook") + 0.4
tWide = cap("12_narator_berantai", "pernah"); tBound = cap("12_narator_berantai", "Paling kuat")
tNeck = cap("12_narator_berantai", "Kedua tangannya"); tLegs = cap("12_narator_berantai", "Dari lutut")
tQ = T("13_dajjal_baisan"); tNoFruit = cap("15_dajjal_thabariyah", "ia tidak"); tLake = cap("15_dajjal_thabariyah", "Danau")
tDry = T("17_dajjal_airhabis"); tZ = T("18_narator_zughar"); tMk = cap("18_narator_zughar", "Lalu tentang")
tSelf = cap("18_narator_zughar", "Setelah itu"); tMasih = T("19_dajjal_pengakuan")
tOut = cap("19_dajjal_pengakuan", "Sebentar lagi"); tLands = cap("19_dajjal_pengakuan", "Tidak ada")
tExcept = cap("19_dajjal_pengakuan", "Kecuali"); tMim = T("20_narator_thaibah")
tKnocks = [x - 0.4 for x in caps_all("Inilah Thaibah")]; tMadinah = cap("20_narator_thaibah", "Madinah.")
tL1 = T("21_raka_gantung") - 0.45; tPoint = T("22_narator_gantung")
tThat = cap("22_narator_gantung", "Dan arah"); tNotB = cap("22_narator_gantung", "bukan Bermuda"); tEnd = E("22_narator_gantung")

# 1) hook
put(boom(3.0), 0.0, 0.9)
put(chain(1.4, 8), 0.3, 0.25, -0.3)
put(chain(1.0, 7), 1.75, 0.3, 0.3)
bed(0, tB2 + 0.4, lambda n: drone(n, 41), 0.10, 0.4)
# 2) dalam biara
put(whoosh(1.2, False), tB2 - 0.5, 0.2)
bed(tB2, tQ, lambda n: drone(n, 41), 0.08, 0.8)
bed(tB2, tQ, lambda n: wind(n, 100, 400), 0.05, 0.8)
put(steps(1.6, 2.5, 0.12), tB2 + 0.2, 1.0)
put(sting(3.0), tWide, 0.07)
put(chain(1.8, 14), tBound, 0.4, -0.2); put(boom(1.6, 55), tBound, 0.35)
put(chain(1.0, 6), tNeck + 0.3, 0.22, 0.1)
put(chain(2.2, 16), tLegs + 0.1, 0.38, 0.2)
# 3) tanya jawab
bed(tQ, tZ, lambda n: wind(n, 150, 700), 0.06, 0.8)
bed(tQ, tLake + 0.4, lambda n: drone(n, 49), 0.05, 0.8)
for k in range(15):
    put(thud(), tNoFruit + 0.5 + k * 0.1 + rng.uniform(0, 0.15), 0.25, rng.uniform(-0.5, 0.5))
put(whoosh(1.0, True), tLake - 0.5, 0.15)
bed(tLake, tDry + 3.0, lambda n: surf(n, 3.5, 0.2), 0.08, 0.8)
put(lp(noise(int(3 * SR)), 200) * env(int(3 * SR), 0.5, 1.5), tDry + 0.4, 0.4)  # air surut
put(crackle(2.2), tDry + 1.6, 0.25)
put(sting(2.5), tDry + 0.4, 0.06)
# 4) Zughar lalu Makkah
t = tZ + 0.2
while t < tMk:
    put(drip(), t, 0.25, rng.uniform(-0.2, 0.2)); t += rng.uniform(0.28, 0.45)
bed(tZ, tMk + 0.3, lambda n: st(lambda m: bp(noise(m), 800, 4000), n), 0.03, 0.5)  # gemericik
put(whoosh(1.2, True), tMk - 0.4, 0.15)
put(shine(4.0, 220), tMk + 0.3, 0.09)
bed(tMk, tSelf, lambda n: wind(n, 200, 800), 0.05, 0.6)
# 5) pengakuan
bed(tSelf, tLands + 0.5, lambda n: drone(n, 36), 0.12, 0.8)
put(boom(3.0, 40), tMasih, 0.95); put(sting(3.0), tMasih, 0.12)
put(chain(1.8, 14), tOut, 0.35, -0.3); put(chain(1.6, 12), tOut + 0.4, 0.3, 0.3); put(growl(2.0), tOut, 0.3)
# 6) 40 malam
bed(tLands, tMim, lambda n: wind(n, 120, 600), 0.08, 0.8)
put(whoosh(tExcept - tLands, True), tLands, 0.12)
put(shine(4.5, 196), tExcept + 0.1, 0.12)
# 7) mimbar
bed(tMim, tL1, lambda n: wind(n, 200, 600), 0.04, 0.8)
for k in tKnocks:
    put(knock(), k, 0.55)
put(whoosh(1.0, True), tMadinah - 0.5, 0.12)
put(shine(3.0, 220), tMadinah, 0.08)
# 8) langgar
bed(tL1, tPoint + 0.3, rain, 0.06, 0.3)
bed(tL1, tPoint + 0.3, crickets, 0.04, 0.3)
# 9) arah
bed(tPoint, tNotB, lambda n: drone(n, 41), 0.07, 0.5)
put(whoosh(2.5, True), tPoint + 0.8, 0.2)
put(boom(2.5, 45), tThat + 0.8, 0.6); put(sting(2.5), tThat + 0.8, 0.08)
# 10) langgar, penutup
put(boom(1.5, 60), tNotB - 0.15, 0.35)
bed(tNotB - 0.2, DUR, rain, 0.06, 0.3)
bed(tNotB - 0.2, DUR, crickets, 0.04, 0.3)
put(chain(1.2, 7), tEnd + 0.3, 0.2, -0.4)

out = mix[: int(DUR * SR)]
out = out / max(1e-9, np.abs(out).max()) * 0.9
wavfile.write(ROOT / "sfx_part2.wav", SR, (out * 32767).astype(np.int16))
print("sfx_part2.wav", round(len(out) / SR, 2), "s")
