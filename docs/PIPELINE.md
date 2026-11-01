# Pipeline satu part

Kerjakan satu part sampai selesai sebelum part berikutnya.

1. **Naskah.** Hook 3 detik + kisah + akhir menggantung. Sumber hadits dicatat di STATUS.md.
2. **VO.** Generate tiap baris di ElevenLabs (1 take). Simpan ke `vo/NN_peran_isi.mp3`, catat di `vo/lines.md`.
   Workspace tidak bisa mengunduh dari server ElevenLabs: Iki mengunduh dan mengirim file.
3. **Timeline.** Isi daftar baris + jeda di `build_vo.py`, jalankan. Hasil: `vo_partN.wav`, `timeline_partN.json`.
4. **Caption.** Tambah teks baris di `make_captions.py`, jalankan. Hasil: `web/data_partN.json`.
5. **Adegan.** Salin `web/scene.js` dari part sebelumnya, ganti bagian `// ---------- adegan ----------`.
   Waktu adegan selalu diambil dari timeline (`T(line)`, `capStart(line, kata)`), jangan angka mati.
6. **Cek frame.** `python render.py stills 2 25 45 ...` lalu lihat (bikin contact sheet dengan ffmpeg tile).
7. **Render final di Colab G4.** Zip folder part (tanpa wav per baris dan mp4), taruh di My Drive, Run all `colab_render.ipynb`.
   Render lokal hanya untuk cek, karena tanpa GPU sekitar 3 fps.
8. **Audio.** `make_sfx.py` (sesuaikan waktu SFX), skoring dari ElevenLabs, lalu
   `python mix_audio.py render.mp4 score.mp3 final.mp4` (video tidak di-encode ulang).

Kalau satu baris VO diganti dan durasinya berubah: jalankan ulang langkah 3, 4, SFX, lalu render ulang.
