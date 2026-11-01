# simulasi-wni-kisah

Seri kisah bernarasi untuk akun Simulasi.WNI: video vertikal 2D bergaya wayang bayangan,
dibangun dengan Three.js, dirender di Colab G4.

## Baca ini dulu (sesuai kebutuhan, jangan semua)

| Mau ngapain | Baca |
|---|---|
| Lanjut part berikutnya | `series/<seri>/STATUS.md` lalu `docs/STYLE.md` |
| Paham urutan kerja | `docs/PIPELINE.md` |
| Ubah gaya visual atau suara | `docs/STYLE.md` |
| Lihat contoh kode adegan | `series/dajjal/part1/web/scene.js` (hanya kalau perlu bikin adegan baru) |

File audio (`vo/*.mp3`, `score_*.mp3`) dan `web/lib/three.module.js` tidak perlu dibaca.

## Struktur

```
docs/STYLE.md         gaya visual, animasi, caption, suara, adab
docs/PIPELINE.md      urutan kerja dari naskah sampai MP4
series/dajjal/
  STATUS.md           status tiap part, pemeran suara, keputusan
  part1/              Part 1 lengkap (bisa jadi template part berikutnya)
    web/              index.html + scene.js (adegan) + data_part1.json
    vo/               VO per baris + lines.md
    build_vo.py       susun VO jadi track + timeline
    make_captions.py  caption sinkron VO
    make_sfx.py       SFX sintesis
    mix_audio.py      mix VO + SFX + skoring ke video
    render.py         render frame lewat __seek(t)
    colab_render.ipynb
```
