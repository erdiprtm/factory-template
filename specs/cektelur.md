# cektelur — Spec v1

> Full build detail (pipeline, data model, ML workstream, acceptance criteria): `specs/cektelur/build-spec.md`. Where this page and the build spec differ, this page wins for plan names.

## One-liner
Aplikasi kamera untuk peternak ayam petelur mandiri: arahkan HP ke tray telur, setiap telur langsung tergrade (kecil/sedang/besar) dan telur retak ditandai, lalu hasilnya otomatis tercatat ke catatan produksi harian. “Scan otomatis, langsung tercatat.”

## Target user & problem
Peternak ayam petelur mandiri skala UMKM yang panen setiap hari dan memakai HP Android kelas Rp1–2 jt. Sekarang mereka mengelap telur, mengecek retak, dan memilah ukuran dengan mata atau timbangan satu per satu, lalu mencatat produksi di buku atau tidak sama sekali. Memilah lambat, catatan tercecer, dan nilai produksi harian tidak terlihat.

## Core features (v1 — max 3)
1. Scan real-time: kamera belakang, overlay grade per telur (kecil/sedang/besar dari ukuran → perkiraan berat, dikalibrasi per kandang) dan tanda RETAK, penghitung, getar + bunyi untuk retak. Inference di HP (ONNX Runtime Web, YOLOX Apache-2.0), jalan offline.
2. Catatan produksi harian: scan disimpan ke Draft, peternak edit lalu "Konfirmasi final" (dengan riwayat edit), input harga per grade → estimasi nilai produksi.
3. Riwayat harian/mingguan/bulanan + bagikan ringkasan (gambar + teks) ke WhatsApp.

## Core loop & funnel
- Core loop (the one thing users repeat): buka kamera → scan tray → pilah dengan tangan → simpan ke catatan → konfirmasi final → lihat estimasi nilai hari ini.
- First 30 seconds (ad → lander → quiz → result): lander "Scan otomatis, langsung tercatat" → daftar email → isi nama kandang + batas grade → kamera langsung terbuka di tray.
- The "aha" (first real result, before the paywall): tray pertama tergrade dan telur retak ditandai merah dalam hitungan detik.
- Why they come back tomorrow: panen setiap hari; catatan & estimasi nilai produksi menumpuk.
- Quiz (5–8 questions): tidak ada quiz terpisah; onboarding = nama kandang, kabupaten/kota, jumlah ayam (opsional), batas grade (gram), kalibrasi (boleh lewati).
- Free uses of the core action before the paywall: trial "3 hari panen" — dihitung per hari yang ada minimal satu scan tersimpan. Setelah itu menyimpan ke catatan butuh paket; layar scan tetap bisa dipakai untuk demo. (paywall after: free uses)
- First ad hooks ("Untuk [siapa] yang [masalah], dapatkan [hasil] dalam [waktu]"): "Untuk peternak petelur yang capek memilah telur satu per satu, dapatkan grade kecil/sedang/besar dan tanda retak langsung di layar dalam 1 tray pertama." Jangan dipasarkan sebagai "AI".

## Paid vs free
- Free / trial: "3 hari panen" — scan + simpan + catatan selama 3 hari panen.
- Paid (3 or 12 months): Peternak = scan tanpa batas, riwayat penuh, estimasi kg & nilai, input harga, bagikan WhatsApp. Juragan = Peternak + multi-pengguna (pekerja kandang) + multi-kandang (MVP: di-stub di balik cek paket).

## Plans & prices
- Peternak 3 bulan: Rp169.000
- Peternak 12 bulan: Rp708.000 + bonus 2 bulan (total 14 bulan)
- Juragan 3 bulan: Rp279.000
- Juragan 12 bulan: Rp1.188.000 + bonus 2 bulan (total 14 bulan)
- Harga pendiri (config, mati secara default): Peternak 12 bulan Rp390.000 untuk 50 pelanggan pertama.
- Bonus hanya untuk paket 12 bulan. Garansi uang kembali 7 hari. Semua harga, bonus, trial, harga pendiri ada di config.
- Pembayaran: DOKU (merchant PT Musim Panen Harmonis), QRIS / e-wallet / VA; sandbox dulu.

## Data the product stores
- Akun (email), profil kandang (nama, kabupaten/kota, jumlah ayam opsional) — lokasi tingkat kabupaten.
- Data produksi harian (jumlah butir & kg per grade, retak), harga telur per grade, sampel kalibrasi (dimensi + gram). **Sensitif secara bisnis**: tidak pernah dibuka ke kandang lain; agregat di masa depan hanya anonim + persetujuan eksplisit (UU PDP).
- Langganan & pembayaran (data standar template).
- Opt-in saja: frame berkeyakinan rendah ("Bantu tingkatkan akurasi") dan video/timbangan dari mode kumpul data, dengan teks persetujuan bahwa data hanya untuk melatih model cektelur.
- Tidak ada data kesehatan atau data anak.

## Content & data sources
- Grade dihitung di HP: ukuran dari kamera (skala = jarak sel tray), berat = k × L × W² dengan k di-fit per kandang dari kalibrasi timbangan. Ditampilkan sebagai perkiraan; batas grade dan k dari peternak.
- Model deteksi (egg, egg_cracked) dilatih sendiri dari data kandang pilot (YOLOX, Apache-2.0). Bukan Ultralytics (AGPL).
- Harga telur diisi peternak sendiri; ditampilkan sebagai "estimasi nilai produksi", bukan penjualan.
- Tidak ada panggilan API AI berbayar sama sekali.

## Out of scope for v1
- API AI/LLM berbayar apa pun
- Deteksi kesegaran / candling, deteksi kotoran
- Perbandingan harga regional, piutang, biaya pakan/laba, produktivitas ayam (fase 2)
- Marketplace data, credit scoring (fase 3+)
- Aplikasi native (nanti: TWA untuk Play Store)
- OTP WhatsApp/SMS (butuh provider berbayar)

## Launch & distribution
- Launch date: setelah pilot 3–6 minggu (build pilot di minggu ke-3)
- First channel(s): peternak pilot + komunitas peternak petelur, lalu iklan
- Success metric at day 30: pilot farmer memakai setiap hari panen; jumlah tray akurat ≥98%; grade sesuai timbangan ≥90% setelah kalibrasi
- Kill criteria at day 60: kurang dari 10 kandang berbayar 60 hari setelah peluncuran → hentikan akuisisi berbayar dan rework bersama Erdi.

## Open questions
- Batas gram kecil/sedang/besar (dan apakah beda per pembeli)
- Jenis tray standar dan jarak sel (mm)
- Dijual per kg, per peti, atau per ikat? (mempengaruhi satuan harga)
- Volume harian dan berapa orang yang memilah
- Waktu memilah sekarang vs dengan cektelur
- Kesediaan bayar: 3 vs 12 bulan, di harga berapa
