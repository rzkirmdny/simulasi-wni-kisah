# Seri Dajjal: status

Naskah lengkap (versi awal 6 part, Part 2 dst masih draf lama): Claude Doc "Naskah Dajjal: Malam Jumat di Langgar"
https://claude.ai/artifact/2og6UrxMqC4sqQbqv19SQ5

## Part 1: Lelaki di Pulau (sekitar 1:56)
Status: SELESAI (2 Nov 2026). Final 1:56, 49 MB: render Colab + VO + SFX + skoring (`mix_audio.py`). Baris 06 Abah memakai suara Eyang ("Nak... mau dengar kisah aslinya?").
File video final tidak disimpan di repo (terlalu besar).
Isi: hook bisikan Dajjal, langgar mati lampu, Madinah (seruan, mimbar), kisah Tamim ad-Dari: badai sebulan, pulau, Al-Jassasah, bergegas ke biara. Gantung: pintu biara terbuka, rantai, satu mata menyala.
Baris VO: 01 sampai 11 (lihat `part1/vo/lines.md`).

## Part 2: Lelaki Berantai (1:38) — siap render Colab (hasil langsung final)
VO baris 12 sampai 22 di `part1/vo/`; `part1/build_vo.py` membuat `part1/vo_part2.wav`.
Folder `part2/`: `web/scene.js` (util disalin dari Part 1), `render.py` (batas segmen dibaca dari `window.__cuts`), `make_sfx.py` -> `sfx_part2.wav`, `mix_audio.py`, `colab_render.ipynb` (zip `dajjal-part2.zip` berisi render.py, web/, vo_part2.wav, sfx_part2.wav, mix_audio.py).
Adegan: 1 hook kepala berantai + "DAJJAL BICARA PADA SAHABAT NABI" · 2 dalam biara, seluruh badan, kamera ke leher lalu kaki · 3 tanya jawab: kebun kurma Baisan (kurma rontok), Danau Thabariyah (surut, retak) · 4 mata air Zughar, lalu Makkah (Ka'bah + cahaya, tanpa sosok) · 5 "Aku adalah Al-Masih" (kilat merah, rantai menegang) · 6 40 malam: kota-kota padam, hitungan MALAM KE-n, tinggal Makkah dan Thaibah bercahaya · 7 mimbar bercahaya tanpa sosok, 3 ketukan, lalu Madinah · 8 langgar, Raka "Bermuda?" · 9 sinar dari Madinah menunjuk satu arah, satu mata di ujung · 10 langgar, "Bersambung · Part 3".
Label tempat di atas (top 330px) memakai elemen #name.
Skoring: pakai ulang `part1/score_part1.mp3` (masuk zip sebagai `score.mp3`, fade mulai 95.1 s).
Colab langsung menghasilkan MP4 final (visual + VO + SFX + skoring lewat `mix_audio.py`).
Belum: render final Colab G4.

## Part 3 dst (rencana, belum final)
Ciri Dajjal (dari timur/Khurasan, mata kanan buta, kafir di dahi), 40 hari (sehari seperti setahun, perkirakan waktu shalat), fitnah hujan/kekeringan dan air/api, Makkah-Madinah dijaga malaikat, pemuda yang dibunuh lalu dihidupkan, Nabi Isa di menara putih Damaskus dan gerbang Lud, tiga bekal (10 ayat Al-Kahfi, doa tasyahud, menjauh).

## Sumber hadits
- Tamim ad-Dari, Al-Jassasah, lelaki berantai, "dari arah timur": HR. Muslim 2942
- Khurasan: HR. Tirmidzi 2237
- Mata buta seperti anggur: HR. Bukhari 3439, Muslim 169
- Kafir di dahi, dibaca tiap mukmin: HR. Muslim 2934; Bukhari 7131, Muslim 2933
- 40 hari, perkiraan shalat, hujan, Nabi Isa, Lud: HR. Muslim 2937
- Fitnah terbesar: HR. Muslim 2946
- Air dan api: HR. Bukhari 3450
- Makkah Madinah dijaga, guncang 3x: HR. Bukhari 1881
- Pemuda: HR. Bukhari 7132, Muslim 2938
- Meleleh seperti garam: HR. Muslim 2897
- 10 ayat Al-Kahfi: HR. Muslim 809; doa tasyahud: HR. Muslim 588; menjauh: HR. Abu Dawud 4319
Nomor hadits belum dicek ulang ke kitab.

## Akun ElevenLabs
- Akun lama kreditnya habis; suara desain Al-Jassasah hanya ada di sana.
- Akun baru dipakai untuk sisanya. Flow VO dan skoring ada di akun baru.
