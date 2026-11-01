# Gaya seri kisah

## Bingkai cerita
- POV Indonesia: malam Jumat, listrik padam, langgar kayu. Abah (guru ngaji) dan dua murid: Raka (12, sok tahu, bawa HP) dan Nisa (8, penakut, berkerudung).
- NARATOR membawa cerita. Abah, Raka, Nisa hanya di bingkai langgar: bertanya, bereaksi, meluruskan mitos.
- Kisah tampil sebagai wayang bayangan di dinding yang diterangi teplok.
- Tiap part: hook 3 detik yang langsung menyebut tokoh utama (mis. Dajjal), akhir menggantung. Durasi 1 sampai 2 menit, mengikuti cerita.

## Adab (wajib)
- Rasulullah ﷺ tidak digambar dan tidak disuarakan. Sabda dibacakan Narator/Abah. Adegan mimbar: mimbar bercahaya saja.
- Nabi dan malaikat tidak digambar (cukup cahaya). Sahabat berupa siluet tanpa wajah.
- Tidak ada simbol agama lain di bangunan antagonis (biara tanpa salib).
- Ayat Al-Qur'an tidak dibacakan suara AI.
- Isi kisah hanya dari hadits sahih; sumber per adegan dicatat di STATUS.md.
- Profesor Sapto, Kentang, dan SFX meme tidak dipakai di seri ini.

## Visual
- Kanvas 1080x1920, 30 fps, kamera orthographic, koordinat piksel dengan titik tengah (0,0), y ke atas.
- Latar wayang: shader dinding hangat (pusat #e9a55c ke tepi #1c0e06), vignette, butiran halus yang berganti 6x per detik (jangan per frame, file jadi besar).
- Siluet: warna #140a05, opacity 0.94, bentuk datar (ShapeGeometry, splineThru).
- Cahaya: selalu pakai `glow()` (gradien radial lembut, additive). Jangan lingkaran bertepi keras.
- Langgar: tokoh berwarna datar diterangi teplok (overlay gelap + pusat cahaya di lampu), bayangan tokoh di dinding.
- Transisi: fade lewat hitam 0.2 sampai 0.6 s; dari langgar ke kisah lewat bayangan tangan Abah yang membesar.
- Gerak: kamera zoom/pan pelan, siluet bergoyang di titik engsel, figur jalan dengan bobbing kecil.
- Semua animasi deterministik dari `t` (noise ber-seed), tidak ada Math.random dan jam real-time.

## Teks
- Font Space Grotesk (500, 700). Semua teks di safe zone x 150 sampai 930.
- Hook: atas (top 250px), 88px bold kapital, kata kunci merah #ff5a3c.
- Judul part: tengah, 72px + subjudul 36px #f3c58a.
- Caption: top 1270px, 54px bold, kotak gelap transparan, maks 7 kata per potongan, muncul dengan pop kecil.
- Label pembicara (selain Narator): pil berwarna di atas caption. RAKA #ffb35a, NISA #ff9cc0, ABAH #b8e3a0, TAMIM #9cc8ff, DAJJAL #ff6a4d, AL-JASSASAH #d2a8ff.
- Penutup: "Bersambung · Part N" di bawah.

## Suara
- VO ElevenLabs, model eleven_v4, 1 take per baris (hemat), tag arahan seperlunya.
- Pemeran (voice_id):
  - NARATOR: Basyar `jXSgE8fsSvkLuY04D16a`
  - ABAH: Eyang `tX4zpyB6s34no1FgD0Mm` (arahan: renta, serak, berwibawa; mis. "[elderly voice] [slowly] [raspy] Nakk...")
  - RAKA: Andi `wvv6DzcHyOVTDgDY7SMW` (suara anak tidak bisa didesain di ElevenLabs)
  - NISA: Lunetta `uQyqjJGSy9EJK7ZcWe4B`
  - TAMIM: Daniel Tirta `sP5bt42ct9Nnx2v7uMAj`
  - DAJJAL: A Serakkk `LxiqOV1uxBCgYTeitAHf`
  - AL-JASSASAH: suara desain, hanya ada di akun ElevenLabs lama
  - PEMUDA (nanti): belum dipilih
- Ucapkan "Rasulullah shallallahu 'alaihi wasallam" di VO; caption tulis "Rasulullah SAW".
- SFX: disintesis sendiri (make_sfx.py), ditaruh sesuai waktu adegan.
- Skoring: ElevenLabs music, 1 variasi, instrumental gelap (drone, oud, ney, frame drum), di-duck saat ada VO.
- Mix akhir: loudness -14 LUFS, TP -1.5.
