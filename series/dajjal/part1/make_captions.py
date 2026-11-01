"""Bikin caption per potongan kalimat yang sinkron ke VO.

Tiap baris dipecah per kalimat. Jeda di dalam audio (silencedetect) dipakai
sebagai batas kalimat kalau jumlahnya cocok; kalau tidak, waktu dibagi
sebanding jumlah huruf. Kalimat panjang dipecah lagi jadi potongan maks 7 kata.
Hasil: web/data_partN.json (timeline + caption) untuk dibaca adegan.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLEAN = ROOT / "vo" / "clean"

TEXT = {
    "01_dajjal_hook": "Sebentar lagi... aku akan diizinkan keluar.",
    "02_narator_janji": "Seorang sahabat Nabi pernah bertemu Dajjal. Dirantai, di sebuah pulau. Dan Rasulullah SAW sendiri yang menceritakannya.",
    "03_narator_langgar": "Malam Jumat. Listrik satu kampung padam.",
    "04_raka_bermuda": "Bah, Dajjal itu beneran dikurung di Segitiga Bermuda?",
    "05_nisa_matilampu": "Kak, jangan ngomongin itu pas mati lampu...",
    "06_abah_kisahasli": "Nak... mau dengar kisah aslinya?",
    "07_narator_madinah": "Madinah. Terdengar seruan: ash-shalatu jami'ah. Orang-orang berdatangan. Selesai shalat, Rasulullah SAW duduk di mimbar sambil tersenyum, lalu bersabda: tetaplah di tempat kalian. Beliau mengumpulkan mereka bukan untuk kabar gembira, bukan juga untuk peringatan. Tapi karena kisah seorang lelaki bernama Tamim ad-Dari.",
    "08_narator_badai": "Tamim dulunya seorang Nasrani yang kemudian masuk Islam. Dia pernah berlayar bersama tiga puluh orang dari kabilah Lakhm dan Judzam. Sebulan penuh ombak mempermainkan kapal mereka. Sampai menjelang matahari terbenam, mereka melihat sebuah pulau.",
    "09_tamim_sekoci": "Kami naik sekoci dan masuk ke pulau itu. Lalu muncul seekor makhluk. Bulunya sangat lebat, kami tidak tahu mana depan, mana belakangnya. Kami bertanya: celaka, makhluk apa engkau?",
    "10_jassasah": "Aku Al-Jassasah. Pergilah ke lelaki di dalam biara itu. Dia sangat merindukan kabar kalian.",
    "11_tamim_takutsetan": "Ketika ia menyebut seorang lelaki, kami takut, jangan-jangan makhluk itu setan. Kami bergegas menuju biara.",
    "12_narator_berantai": "Di dalamnya ada manusia paling besar yang pernah mereka lihat. Paling kuat belenggunya. Kedua tangannya terikat ke leher. Dari lutut sampai mata kakinya, dirantai besi.",
    "13_dajjal_baisan": "Ceritakan padaku tentang kebun kurma Baisan. Masih berbuah?",
    "14_tamim_masih": "Masih.",
    "15_dajjal_thabariyah": "Sebentar lagi, ia tidak akan berbuah. Danau Thabariyah, masih ada airnya?",
    "16_tamim_airbanyak": "Airnya banyak.",
    "17_dajjal_airhabis": "Sebentar lagi, airnya akan habis.",
    "18_narator_zughar": "Dia juga bertanya tentang mata air Zughar. Lalu tentang seorang nabi yang muncul di Makkah. Setelah itu, dia membuka siapa dirinya.",
    "19_dajjal_pengakuan": "Aku adalah Al-Masih. Sebentar lagi, aku akan diizinkan keluar. Tidak ada satu negeri pun yang tidak kudatangi dalam empat puluh malam. Kecuali Makkah dan Thaibah.",
    "20_narator_thaibah": "Rasulullah SAW mengetukkan tongkatnya ke mimbar. Inilah Thaibah. Inilah Thaibah. Inilah Thaibah. Madinah.",
    "21_raka_gantung": "Terus pulaunya di mana, Bah? Bermuda?",
    "22_narator_gantung": "Rasulullah SAW menunjuk satu arah. Dan arah itu... bukan Bermuda.",
}

MAX_WORDS = 7


def speech_segments(wav):
    out = subprocess.run(
        ["ffmpeg", "-i", str(wav), "-af", "silencedetect=noise=-38dB:d=0.28", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
        capture_output=True, text=True).stdout)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    segs, cur = [], 0.0
    for s, e in zip(starts, ends):
        if s - cur > 0.15:
            segs.append([cur, s])
        cur = e
    if dur - cur > 0.15:
        segs.append([cur, dur])
    return segs, dur


def sentences(text):
    parts = re.split(r"(?<=[.?!])\s+", text.strip())
    return [p for p in parts if p]


def chunk(sentence):
    words = sentence.split()
    if len(words) <= MAX_WORDS:
        return [sentence]
    # pecah di koma kalau bisa, kalau tidak bagi rata
    pieces, buf = [], []
    for w in words:
        buf.append(w)
        if (w.endswith(",") or w.endswith(":")) and len(buf) >= 3:
            pieces.append(" ".join(buf)); buf = []
        elif len(buf) >= MAX_WORDS:
            pieces.append(" ".join(buf)); buf = []
    if buf:
        if pieces and len(buf) <= 2:
            pieces[-1] += " " + " ".join(buf)
        else:
            pieces.append(" ".join(buf))
    return pieces


def spread(items, t0, t1):
    total = sum(len(x) for x in items) or 1
    out, t = [], t0
    for x in items:
        d = (t1 - t0) * len(x) / total
        out.append((x, t, t + d)); t += d
    return out


def line_captions(name, start):
    segs, dur = speech_segments(CLEAN / f"{name}.wav")
    sents = sentences(TEXT[name])
    if len(segs) == len(sents):
        timed = [(s, a, b) for s, (a, b) in zip(sents, segs)]
    else:
        # batas kalimat proporsional, lalu ditempel ke jeda terdekat (maks 1,2 s)
        timed = spread(sents, 0.0, dur)
        gaps = [(segs[i][1] + segs[i + 1][0]) / 2 for i in range(len(segs) - 1)]
        bounds = [b for _, _, b in timed[:-1]]
        snapped = []
        for b in bounds:
            near = min(gaps, key=lambda g: abs(g - b)) if gaps else b
            snapped.append(near if abs(near - b) <= 1.2 else b)
        edges = [0.0] + snapped + [dur]
        timed = [(s, edges[i], edges[i + 1]) for i, s in enumerate(sents)]
    caps = []
    for s, a, b in timed:
        for piece, c0, c1 in spread(chunk(s), a, b):
            caps.append({"text": piece, "start": round(start + c0, 3), "end": round(start + c1, 3)})
    return caps, len(segs) == len(sents)


if __name__ == "__main__":
    for n in (1, 2):
        tl = json.loads((ROOT / f"timeline_part{n}.json").read_text())
        caps = []
        for row in tl["lines"]:
            c, aligned = line_captions(row["line"], row["start"])
            for x in c:
                x["role"] = row["role"]
            caps += c
            print(f"part{n} {row['line']:<24} {'jeda cocok' if aligned else 'proporsional'}")
        tl["captions"] = caps
        (ROOT / "web" / f"data_part{n}.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False))
