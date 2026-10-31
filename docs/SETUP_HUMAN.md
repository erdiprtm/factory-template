# Panduan Setup untuk Manusia

Dokumen ini berisi semua langkah yang **hanya bisa dikerjakan manusia** (akun, login, kredensial). Agent (Claude Code) akan berhenti dan menunjuk ke bagian yang relevan saat fasenya tiba.

| Langkah | Kapan dikerjakan | Status |
|---|---|---|
| 0. Pasang tools di Mac | **Sekarang (Phase 0)** | ☐ |
| 1. GitHub + `gh auth login` | **Sekarang (Phase 0)** | ☐ |
| 2. Cloudflare + `wrangler login` | **Sekarang (Phase 0)** | ☐ |
| 3. Duitku sandbox | Phase 4 (Billing) | ☐ |
| 4. Google OAuth | Phase 3 (Auth) | ☐ |
| 5. OpenPanel | Phase 6–7 (Analytics) | ☐ |
| 6. Sentry | Phase 7 (Observability) | ☐ |
| 7. Email (Resend) | Phase 3 (Auth) | ☐ |
| 8. Expo Go di HP | Phase 1 | ☐ |
| 9. Token Cloudflare → GitHub Secrets (sekali saja) | Phase 1 | ☐ |

> **Cara kerja pengiriman (blueprint v4):** agent membuat PR sendiri, PR otomatis di-merge kalau semua pengecekan lulus, lalu otomatis tayang ke produksi. Kalau tes setelah deploy gagal, sistem otomatis kembali ke versi sebelumnya dan membuat *issue* di GitHub. **Kamu tidak perlu menyetujui deploy.** Tugasmu hanya akun, kredensial, pembayaran, dan review hukum.
>
> Yang sengaja **hanya bisa dilakukan manusia** (agent diblokir): menghapus repo, database, bucket, atau Worker; memulihkan database dari backup; dan mengubah visibilitas repo.

> **Aturan soal secret (API key, client secret, password):**
> - **Jangan kirim secret lewat chat** ke agent. Simpan dulu di password manager.
> - Nanti, di fase terkait, kamu akan mengisinya sendiri ke file `.dev.vars` (file lokal, tidak ikut di-commit ke Git). Agent menyiapkan contoh isinya di `.dev.vars.example`.
> - Semua kredensial pembayaran di tahap ini adalah **sandbox** (uang mainan), bukan produksi.

---

## 0. Pasang tools di Mac

Hasil pengecekan (11 Okt 2026) di Mac kamu (Apple Silicon, macOS 26):

| Tool | Status |
|---|---|
| git | ✅ terpasang (2.50.1) |
| Homebrew | ❌ belum ada |
| Node.js (LTS) | ❌ belum ada |
| pnpm | ❌ belum ada |
| GitHub CLI (`gh`) | ❌ belum ada (tapi ada sisa konfigurasi login lama untuk akun `erdiprtm`) |
| Wrangler | ❌ belum ada (ini normal, lihat langkah 0.5) |

Buka aplikasi **Terminal**, lalu jalankan perintah di bawah satu per satu.

### 0.1 Pasang Homebrew (pengelola aplikasi untuk Mac)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- Kamu akan diminta **password login Mac**. Saat mengetik, karakternya memang tidak terlihat. Itu normal.
- Di akhir, installer menampilkan bagian **"Next steps"** berisi 2–3 baris perintah (`echo ... >> ~/.zprofile` dan `eval ...`). **Salin dan jalankan baris-baris itu persis seperti yang ditampilkan.**
- Cek: `brew --version` harus menampilkan versi.

Sumber: <https://brew.sh>

### 0.2 Pasang Node.js 24 (LTS) dan GitHub CLI

```bash
brew install node@24 gh
```

`node@24` tidak otomatis masuk PATH (Homebrew menyebutnya *keg-only*), jadi tambahkan sekali:

```bash
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zprofile
```

Lalu **tutup Terminal dan buka lagi**. Cek:

```bash
node --version
```

Harus muncul `v24.x.x`.

> Kenapa Node 24? Saat ini (Okt 2026) Node 24 adalah versi LTS aktif. Node 26 dijadwalkan menjadi LTS sekitar akhir Oktober 2026. Template akan dibuat agar jalan di Node 24 maupun 26. Detail di `docs/DECISIONS.md`.

### 0.3 Pasang pnpm

Pakai script resmi pnpm:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

Tutup Terminal dan buka lagi, lalu cek:

```bash
pnpm --version
```

Sumber: <https://pnpm.io/installation>

### 0.4 Atur identitas Git (dipakai di setiap commit)

```bash
git config --global user.name "Nama Kamu"
```

```bash
git config --global user.email "email-yang-terdaftar-di-github@contoh.com"
```

Tips: kalau tidak mau email asli terlihat publik di commit, pakai alamat *noreply* dari GitHub → **Settings → Emails** (bentuknya `12345678+erdiprtm@users.noreply.github.com`).

### 0.5 Wrangler (CLI Cloudflare)

**Tidak perlu dipasang global.** Cloudflare menyarankan Wrangler dipasang per proyek; agent akan memasangnya di repo pada Phase 1. Untuk login sekarang, cukup pakai `npx` (lihat langkah 2).

---

## 1. GitHub + `gh auth login`

1. Pastikan kamu punya akun GitHub. (Di Mac ini tercatat pernah login sebagai **`erdiprtm`**.) Kalau belum punya: <https://github.com/signup>.
2. Cek apakah login lama masih berlaku:

   ```bash
   gh auth status
   ```

3. Kalau statusnya **tidak** "Logged in", login ulang:

   ```bash
   gh auth login --scopes workflow
   ```

   Jawab pertanyaannya begini:
   - *Where do you use GitHub?* → **GitHub.com**
   - *Preferred protocol for Git operations?* → **HTTPS**
   - *Authenticate Git with your GitHub credentials?* → **Yes**
   - *How would you like to authenticate?* → **Login with a web browser**, salin kode 8 karakter yang muncul, tekan Enter, tempel kodenya di browser, lalu klik **Authorize**.

4. Kalau ternyata login lama **masih berlaku**, tetap tambahkan izin `workflow` (dibutuhkan agar agent bisa push file GitHub Actions):

   ```bash
   gh auth refresh -h github.com -s workflow
   ```

5. Cek akhir: `gh auth status` menampilkan **Logged in to github.com account erdiprtm** dan daftar *Token scopes* memuat `workflow`.

### Soal paket GitHub (penting untuk auto-merge)

Auto-merge di sini bergantung pada aturan proteksi branch `main` (*ruleset*). Di akun **GitHub Free**, fitur ini kemungkinan hanya jalan di repo **publik**. Untuk repo **privat**, kamu butuh **GitHub Pro**. Sebagai mahasiswa (email `northeastern.edu`), kamu bisa dapat GitHub Pro **gratis** lewat **GitHub Student Developer Pack**: <https://education.github.com/pack>. Agent akan mengecek paket akunmu di Phase 1. Kalau ternyata perlu, kamu tinggal pilih: daftar Student Pack, atau jadikan repo template publik (template ini tidak berisi rahasia apa pun).

---

## 2. Cloudflare + `wrangler login`

1. Daftar akun (gratis): <https://dash.cloudflare.com/sign-up>, lalu verifikasi email.
2. Di dashboard, buka menu **Workers & Pages** sekali. Kalau diminta memilih **subdomain `workers.dev`**, pilih nama yang singkat dan netral (misalnya nama studio kamu). Semua URL preview akan berbentuk `https://<nama-worker>.<subdomain>.workers.dev`, jadi pilih yang tidak memalukan untuk dilihat orang.
3. Login dari Terminal:

   ```bash
   npx wrangler login
   ```

   - Kalau ditanya *"Need to install the following packages: wrangler… Ok to proceed?"* → ketik `y`.
   - Browser akan terbuka → klik **Allow**.
4. Cek:

   ```bash
   npx wrangler whoami
   ```

   Harus menampilkan email dan **Account ID** Cloudflare kamu.

   Jalankan kedua perintah `npx` ini dari Terminal biasa, **di luar** folder repo. Di dalam repo produk, npm menolak `npx` (`EBADDEVENGINES`). Kalau sudah di dalam repo, pakai `pnpm --filter @factory/api exec wrangler login`.

### Kapan perlu upgrade ke Workers Paid (mulai US$5/bulan)?

Paket gratis cukup untuk membangun template. Upgrade diperlukan kalau salah satu ini terjadi (angka dari dokumentasi resmi Cloudflare, Okt 2026):

| Batas paket gratis | Kenapa relevan |
|---|---|
| 100.000 request/hari per akun | Produk yang mulai ramai |
| CPU 10 ms per request | Endpoint berat (mis. pemrosesan data) |
| **5 Cron Trigger per akun** | Tiap produk memakai cron (pengingat perpanjangan, kedaluwarsa pembayaran). Ini biasanya batas pertama yang kena saat produk ke-3 sampai ke-5 |
| **10 database D1 per akun**, maks 500 MB per database | Tiap produk butuh ±2 database (preview + produksi) → maksimal ±5 produk |
| Time Travel (backup D1) hanya 7 hari | Paid: 30 hari |

**Saran:** tetap gratis selama membangun template; **upgrade ke Workers Paid sebelum produk pertama launch**.

Sumber: <https://developers.cloudflare.com/workers/platform/limits/>, <https://developers.cloudflare.com/d1/platform/limits/>, <https://developers.cloudflare.com/workers/platform/pricing/>

> Token API Cloudflare untuk GitHub Actions **belum** perlu dibuat sekarang. Instruksinya diberikan di checkpoint Phase 1.

---

## 2a. Cara menyimpan secret ke Worker (dipakai di langkah-langkah berikutnya)

Beberapa langkah di bawah meminta kamu menyimpan *secret* (API key, token) ke Worker di Cloudflare. Caranya selalu sama, dan bisa dijalankan lewat tombol **Run** di aplikasi Claude (D-072):

1. **Salin** nilainya (key, token) ke clipboard dari dashboard layanannya.
2. Tekan **Run** pada perintah yang diberikan. Setiap blok berisi satu perintah, misalnya:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put NAMA_SECRET --env preview
   ```
   - `pbpaste |` mengirim isi clipboard ke perintahnya. Nilainya **tidak tampil** di layar maupun di chat, dan tidak ada prompt yang perlu diisi.
   - `pnpm --filter @factory/api exec wrangler` jalan dari folder mana pun di dalam repo, jadi tidak perlu `cd apps/api` lebih dulu. Jangan pakai `npx wrangler` di dalam repo produk: npm menolaknya (`EBADDEVENGINES`) karena repo ini memakai pnpm.
   - `--env preview` = Worker preview. `--env=""` = Worker **produksi**. Tanpa `--env` sama sekali, wrangler menampilkan peringatan "Multiple environments"; peringatan itu tidak berbahaya, tapi `--env=""` lebih jelas.
3. Perintah ini **tidak men-deploy apa pun**. Secret ikut aktif di rilis CI berikutnya. Kalau wrangler menyarankan `wrangler versions deploy`, **jangan** jalankan: deploy hanya lewat CI.

Nilai yang bukan rahasia (misalnya alamat pengirim email) boleh ditulis langsung: `echo 'Nama <halo@domainmu.id>' | …`.

Secret **GitHub Actions** yang sama untuk semua produk (token Cloudflare) diatur sekaligus dengan `pnpm setup-secrets`, bukan dengan cara ini. Lihat `docs/SECRETS.md`.

---

## 2b. Cloudflare R2 — penyimpanan file (sekali per akun Cloudflare)

Produk menyimpan file pengguna (misalnya thumbnail foto makanan) di R2. R2 harus diaktifkan sekali saja.

1. Buka <https://dash.cloudflare.com> → **R2 Object Storage** → **Purchase R2 Plan / Enable R2**.
2. Cloudflare meminta metode pembayaran. Paket gratisnya mencakup 10 GB penyimpanan per bulan, plus jutaan operasi baca/tulis, dan **tidak ada biaya keluar data (egress)**. Selama pemakaian masih di bawah batas itu, tagihannya Rp0.
3. Kabari agent: "R2 aktif". Agent lalu membuat bucket template (`factory-template-files`, `factory-template-files-preview`). Bucket untuk setiap produk baru dibuat otomatis oleh `/new-product`.

---

## 3. Duitku sandbox (dikerjakan di Phase 4)

1. Daftar akun merchant: <https://passport.duitku.com/merchant/Project/>
   - Verifikasi email dan nomor HP (lewat OTP).
2. Setelah login, kamu otomatis berada di **mode sandbox** (uang mainan). Dashboard proyek sandbox: <https://sandbox.duitku.com/merchant/Project>
3. Klik **Tambah Proyek** (Add Project). Isi nama, misalnya `Factory Template Sandbox`. Kalau diminta URL website, boleh diisi URL `workers.dev` dari langkah 2 (bisa diubah nanti).
4. Di daftar proyek, salin dua nilai ini ke password manager:
   - **Kode Merchant** (Merchant Code)
   - **API Key** (Merchant Key)
5. **Callback URL:** sudah dipastikan di Phase 4. Aplikasi mengirim callback URL di setiap transaksi (`https://<alamat-aplikasi>/api/webhooks/duitku`), jadi **tidak perlu diatur di dashboard**.
6. **Metode pembayaran:** halaman bayar Duitku menampilkan **semua channel yang aktif di proyek**. Aktifkan di dashboard proyek: QRIS, DANA, ShopeePay, OVO, dan Virtual Account.
7. **Simpan ke Cloudflare** (cara di langkah 2a). Salin **Merchant Code**, lalu Run dua perintah ini (preview, lalu produksi):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DUITKU_MERCHANT_CODE --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DUITKU_MERCHANT_CODE --env=""
   ```
   Salin **API Key**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DUITKU_API_KEY --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DUITKU_API_KEY --env=""
   ```
   Mode tetap **sandbox** sampai kamu sendiri memutuskan pindah ke produksi.
8. **Cara mensimulasikan bayar di sandbox:** pilih **Virtual Account** di halaman bayar, salin nomor VA-nya, lalu buka <https://sandbox.duitku.com/payment/demo/demosuccesstransaction.aspx> dan masukkan nomor VA tersebut. Untuk QRIS ShopeePay ada aplikasi Shopee *staging* (link di dokumentasi Duitku). DANA/OVO sandbox tidak punya simulator resmi.

Catatan untuk nanti (bukan sekarang): pindah ke produksi butuh verifikasi dokumen. Untuk merchant perorangan: KTP, NPWP, dan rekening bank; untuk badan usaha: dokumen PT.

Sumber: <https://docs.duitku.com/pop/en/>

### 3b. DOKU sandbox (opsional, hanya kalau produk memakai DOKU)

Template mendukung DOKU Checkout sebagai penyedia kedua. Langkah ini **hanya** perlu kalau di `product.config.ts` tertulis `payments: { provider: "doku", ... }`. Kalau masih Duitku, lewati.

1. Daftar akun sandbox: **akun terpisah di situs terpisah**, <https://sandbox.doku.com/bo/sandbox-registration> (D-105). Di dashboard produksi (<https://dashboard.doku.com/>) tidak ada tombol Sandbox, dan kunci produksi ditolak server sandbox ("Invalid Client-Id"). Kalau akun produksi sudah terverifikasi, sandbox boleh dilewati: uji pembuatan checkout ke API produksi tidak menarik uang selama halaman bayarnya tidak dibayar.
2. Di Back Office: **Integration → API Keys**. Salin dua nilai ini ke password manager:
   - **Client ID** (contoh bentuknya `BRN-xxxx-xxxxxxxxxxxx`)
   - **Secret Key** (bukan *Public Key*). Hanya dua ini yang dipakai: DOKU Public Key, Merchant Public Key dan Token URL di "Pengaturan SNAP" untuk API SNAP, yang tidak dipakai template.
3. **Notification URL** (wajib, beda dengan Duitku): DOKU tidak menerima alamat callback per transaksi, jadi harus diisi di dashboard **untuk setiap channel** yang dipakai. Buka **Settings → Payment Settings**, lalu untuk Virtual Account, e-Wallet, QRIS, dan lainnya klik **CONFIGURE** dan isi:
   - Preview: `https://factory-template-preview.erdiprtm.workers.dev/api/webhooks/doku`
   - Produksi (akun produksi, nanti): `https://factory-template.erdiprtm.workers.dev/api/webhooks/doku`

   Catatan: satu akun sandbox hanya punya satu Notification URL per channel, jadi notifikasi sandbox masuk ke **preview** Worker yang tetap (bukan URL `pr-<n>`).
4. **Metode pembayaran:** halaman DOKU Checkout menampilkan semua channel yang aktif di akun. Aktifkan yang dipakai produk (QRIS, e-wallet, Virtual Account).
5. **Simpan ke Cloudflare** (cara di langkah 2a). Salin **Client ID**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DOKU_CLIENT_ID --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DOKU_CLIENT_ID --env=""
   ```
   Salin **Secret Key**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DOKU_SECRET_KEY --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put DOKU_SECRET_KEY --env=""
   ``` Mode tetap **sandbox** (`DOKU_MODE`) sampai kamu sendiri memutuskan pindah.
6. **Simulasi bayar:** pilih Virtual Account di halaman DOKU, lalu ikuti petunjuk simulasi pembayaran sandbox di dokumentasi DOKU (agen belum memverifikasi letak menunya; kabari kalau tampilannya beda).

Sumber: <https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration> dan <https://developers.doku.com/get-started-with-doku-api/notification/setup-notification-url>

### 3c. Pakasir (opsional, hanya kalau produk memakai Pakasir)

Template juga mendukung **Pakasir** (QRIS dan Virtual Account, halaman bayarnya di dalam aplikasi sendiri). Langkah ini **hanya** perlu kalau di `product.config.ts` tertulis `payments: { provider: "pakasir", ... }`. Kalau masih Duitku, lewati.

1. Masuk ke <https://app.pakasir.com> dengan **Login with Nofbox**, lalu lengkapi KYC akun dengan KTP (ditinjau 1–3 hari kerja, hasilnya lewat email). Proyek boleh dibuat sambil menunggu.
2. Buat **Proyek** baru, misalnya `Myna Fit`. Proyek baru otomatis dalam **mode sandbox** (uang mainan). Untuk menerima uang sungguhan (Go Live) nanti perlu **KYC Proyek**.
3. Buka halaman **Detail Proyek**. Di bagian bawah ada dua nilai, salin ke password manager:
   - **Slug** proyek
   - **API Key**
4. **Webhook URL** (wajib diisi di halaman Detail Proyek yang sama, satu alamat per proyek):
   - Proyek sandbox: `https://factory-template-preview.erdiprtm.workers.dev/api/webhooks/pakasir`
   - Proyek live (nanti, produksi): `https://<domain-produk>/api/webhooks/pakasir`

   Ganti `factory-template` dengan slug produk. Notifikasi sandbox masuk ke Worker **preview** yang tetap (bukan URL `pr-<n>`). Halaman bayar juga memeriksa status sendiri setiap 5 detik, jadi pratinjau PR tetap jalan tanpa webhook.
5. Paling bawah di halaman Detail Proyek ada **Webhook Secret** (bisa di-reset di sana). Salin juga ke password manager.
6. **Simpan ke Cloudflare** (cara di langkah 2a). Selama proyeknya masih **sandbox**, isi preview dan produksi. Salin **Slug**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_SLUG --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_SLUG --env=""
   ```
   Salin **API Key**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_API_KEY --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_API_KEY --env=""
   ```
   Salin **Webhook Secret**, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_WEBHOOK_SECRET --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put PAKASIR_WEBHOOK_SECRET --env=""
   ```
   Preview (`--env preview`) **hanya** boleh memakai kunci proyek **sandbox**. Kalau nanti proyeknya Go Live, buat proyek sandbox terpisah untuk preview, dan isi preview dengan kunci proyek sandbox itu.
7. **Mode** tetap **sandbox** (`PAKASIR_MODE` di `apps/api/wrangler.jsonc`) sampai kamu sendiri memutuskan Go Live. Saat itu ubah `PAKASIR_MODE` produksi menjadi `"live"` lewat PR. Preview selalu sandbox apa pun isinya. Dalam mode live, transaksi sandbox tidak pernah membuka akses.
8. **Metode pembayaran** diatur di `product.config.ts` `payments.methods` dengan kode Pakasir: `qris`, `bri_va`, `bni_va`, `cimb_niaga_va`, `maybank_va`, `danamon_va`, `bnc_va`, `bsi_va`, `muamalat_va`, `ocbc_va`. QRIS tampil paling atas. VA butuh harga minimal Rp10.000. Biaya Pakasir (QRIS 0,7% + Rp310, VA Rp3.500) dibayar pembeli dan tampil di layar bayar.
9. **Simulasi bayar di sandbox** (D-095): buka layar bayar di app (QRIS atau VA), ambil `txn_id` transaksinya dari dashboard proyek sandbox (menu transaksi), salin **API Key** proyek sandbox, lalu jalankan perintah ini dengan slug dan `txn_id` diganti. Pakasir menandai transaksi lunas dan mengirim webhook; layar bayar berubah jadi "Pembayaran berhasil" sendiri. Hanya bisa untuk transaksi sandbox. Di laptop, tanpa secret, aplikasi memakai Pakasir tiruan: `POST /api/dev/pakasir-pay?paymentId=…`.

   ```bash
   curl -s -X POST "https://app.pakasir.com/api/v2/payment-simulation/SLUG/TXN_ID" -H "X-Api-Key: $(pbpaste)"
   ```
10. **Refund:** Pakasir tidak punya fitur refund. Kembalikan dana secara manual lalu tandai di /admin (lihat `docs/OPERATIONS.md` bagian Refunds).
11. **Kembali ke Duitku nanti:** cukup ubah `payments.provider` dan `methods` di `product.config.ts` dan isi secret Duitku. Langganan yang sudah aktif tetap berlaku.

Sumber: <https://pakasir.com/p/create-transaction>, <https://pakasir.com/p/webhook>, <https://pakasir.com/p/get-started> (dibaca 2026-10-19)

---

## 4. Google OAuth — "Login dengan Google" (dikerjakan di Phase 3)

1. Buka <https://console.cloud.google.com/> → pilih/buat project baru, misalnya `factory-template`.
2. Buka **Google Auth Platform**: <https://console.developers.google.com/auth/overview> → klik **Get started**:
   - **App name**: nama produk/studio
   - **User support email**: email kamu
   - **Audience**: **External**
   - **Contact information**: email kamu → setujui kebijakan → **Create**
3. Menu **Audience** → bagian **Test users** → tambahkan alamat Gmail yang akan kamu pakai untuk mencoba login. (Selama status aplikasi masih *Testing*, hanya test user yang bisa login.)
4. Menu **Clients** → **Create client**:
   - **Application type**: **Web application**
   - **Name**: `factory-template-web`
   - **Authorized redirect URIs**: tambahkan dua URL ini persis:
     - `https://factory-template.erdiprtm.workers.dev/api/auth/callback/google` (produksi)
     - `http://localhost:8787/api/auth/callback/google` (lokal)
   - URL preview per-PR berubah-ubah, jadi **di preview login cukup lewat magic link**. Login Google dites di produksi dan lokal.
   - Klik **Create**.
5. **Segera salin Client ID dan Client Secret** ke password manager. Client Secret **hanya ditampilkan sekali**; setelah itu yang terlihat hanya 4 karakter terakhir.
6. Perubahan redirect URI bisa butuh **5 menit sampai beberapa jam** untuk aktif. Kalau muncul error `redirect_uri_mismatch`, tunggu sebentar dan cek ulang URL-nya.

Sumber: <https://support.google.com/cloud/answer/15549257>, <https://www.better-auth.com/docs/authentication/google>

---

## 5. OpenPanel — analytics (dikerjakan di Phase 6–7)

1. Daftar: <https://dashboard.openpanel.dev>
2. Ikuti onboarding: buat **organization**, lalu satu **project** per produk (untuk template: `factory-template`).
3. Di pengaturan project, buat **client** untuk web, salin **Client ID**, dan masukkan domain yang diizinkan (URL `workers.dev` dulu, domain asli nanti).
4. **Client Secret** (dibuat bersama client). Jangan kirim ke chat. Simpan ke Worker **produksi** saja, untuk event dari server (pembayaran, pengingat). Salin, lalu Run (cara di langkah 2a):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put OPENPANEL_CLIENT_SECRET --env=""
   ```

**Soal biaya (Okt 2026):** OpenPanel Cloud **tidak punya paket gratis permanen**. Ada trial 30 hari, lalu paket termurah ±US$2,50/bulan (5.000 event). Alternatifnya self-host (gratis, tapi perlu server sendiri). Saran: tunda daftar sampai Phase 6 agar trial tidak habis sebelum dipakai.

Sumber: <https://openpanel.dev/pricing>

---

## 6. Sentry — pemantauan error (dikerjakan di Phase 7)

1. Daftar (paket gratis cukup): <https://sentry.io/signup/>
2. Buat **dua project**:
   - Platform **React**, nama `factory-template-web` (untuk browser)
   - Platform **Cloudflare Workers**, nama `factory-template-api` (untuk server)
3. Untuk masing-masing project: **Settings → Projects → (pilih project) → Client Keys (DSN)** → salin **DSN**.

DSN bukan rahasia tingkat tinggi (DSN browser memang terlihat di aplikasi), tapi tetap simpan di password manager agar rapi.

Sumber: <https://docs.sentry.io/platforms/javascript/guides/cloudflare/>

---

## 7. Email — Resend (dikerjakan di Phase 3)

Email dipakai untuk magic link login, struk pembayaran, dan pengingat perpanjangan.

**Kenapa Resend, bukan Cloudflare?** Layanan kirim email Cloudflare (Email Service) per Okt 2026 masih **beta**, dan mengirim ke alamat sembarang butuh Workers Paid. Sesuai blueprint, kita pakai Resend dulu. Kodenya dibuat lewat *adapter*, jadi nanti bisa pindah ke Cloudflare tanpa menulis ulang. Detail di `docs/DECISIONS.md`.

1. Daftar: <https://resend.com/signup>
2. Menu **API Keys** → **Create API Key** → nama `factory-template-dev`, izin **Sending access** → **salin key-nya** (hanya ditampilkan sekali).
3. **Penting soal domain:**
   - **Tanpa domain sendiri**, Resend hanya bisa mengirim email **ke alamat email akun Resend kamu sendiri**. Ini cukup untuk mencoba magic link di preview (login pakai email yang sama dengan akun Resend).
   - **Sebelum launch**, kamu perlu domain sendiri: **Domains → Add Domain** → tambahkan record DNS yang diminta → tunggu status *Verified*.
4. Paket gratis: 3.000 email/bulan, maksimal 100 email/hari.
5. **Simpan ke Cloudflare** (cara di langkah 2a). Salin API key-nya, lalu:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put RESEND_API_KEY --env preview
   ```
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put RESEND_API_KEY --env=""
   ```
   Setelah domain terverifikasi, atur juga alamat pengirimnya (bukan rahasia, jadi ditulis langsung; ganti dengan alamatmu):
   ```bash
   echo 'Nama Produk <halo@hello.domainmu.id>' | pnpm --filter @factory/api exec wrangler versions secret put MAIL_FROM --env=""
   ```
6. **Balasan pelanggan (Reply-To).** Kalau pelanggan membalas email login atau struk, balasannya otomatis masuk ke `legal.contactEmail` di `product.config.ts`, bukan ke alamat pengirim. Ini penting kalau pengirimnya subdomain khusus kirim yang tidak punya inbox, misalnya `halo@hello.domainmu.id`. Mau diarahkan ke alamat lain? Isi secret `MAIL_REPLY_TO` dengan cara di langkah 2a (`echo 'cs@domainmu.id' | …`, D-067).

Sumber: <https://resend.com/pricing>, <https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>

---

## 7b. Masuk lewat kode 6 digit (otomatis, tidak perlu disiapkan)

Masuk lewat kode 6 digit di email, untuk yang membuka tautan dari aplikasi email. Email masuk sekarang berisi tautan **dan** kode 6 digit. Orang yang membuka tautan dari aplikasi email (Gmail, Outlook) sering masuk di browser aplikasi itu, bukan di Chrome/Safari tempat mereka mulai. Mereka cukup mengetik kodenya di halaman "Cek email kamu", lalu langsung masuk di sana. Kode berlaku 5 menit, maksimal 3 percobaan. Kalau tautan atau kode sudah dipakai, yang satunya otomatis tidak berlaku lagi (D-079). Produk bisa mematikannya dengan `auth.emailCode: false`.

## 8. Expo Go di HP (dikerjakan di Phase 1)

Aplikasinya dibuat dengan Expo, jadi nanti bisa jadi aplikasi iOS/Android dari kode yang sama. Di Phase 1, agent perlu bukti bahwa aplikasinya juga jalan di HP.

1. Pasang **Expo Go** dari Play Store (Android) atau App Store (iPhone).
2. Pastikan HP dan Mac tersambung ke **Wi-Fi yang sama**.
   - **Khusus iPhone (aturan baru sejak Sep 2026):** kamu perlu akun Expo gratis (<https://expo.dev/signup>). Login di Expo Go (ikon akun) dan juga di Mac dengan `pnpm --filter @factory/app exec expo login`. Pakai akun yang sama di keduanya. Android tidak perlu.
   - Aplikasi ini memakai **Expo SDK 57**. Begitu SDK 58 resmi rilis (sedang beta), Expo Go di toko aplikasi akan pindah ke SDK 58. Jadi sebaiknya tes ini dikerjakan segera.
3. Di Phase 1, agent akan menampilkan QR code. Buka Expo Go dan pindai QR-nya (di iPhone: pakai aplikasi Kamera), lalu kirim foto layar HP atau bilang apa yang muncul.

---

## 9. Token Cloudflare untuk GitHub Actions (dikerjakan di Phase 1, sekali saja)

GitHub Actions butuh izin untuk deploy ke Cloudflare atas namamu.

**A. Buat token di Cloudflare**
1. Buka <https://dash.cloudflare.com/profile/api-tokens> → **Create Token**.
2. Di template **Edit Cloudflare Workers**, klik **Use template**.
3. Di bagian **Permissions**, klik **+ Add more**, lalu tambahkan: **Account** → **D1** → **Edit**. (Template bawaan tidak berisi izin D1, padahal database kita butuh.)
4. **Account Resources**: *Include* → akun kamu (Erdiprtm@gmail.com's Account).
5. **Zone Resources**: *Include* → *All zones from an account* → akun kamu. Kalau belum punya domain, pilihan ini tetap boleh.
6. **Continue to summary** → **Create Token** → **salin token-nya**. Token hanya ditampilkan sekali.

⚠️ **Jangan pakai "Global API Key"** (bagian *API Keys* di halaman yang sama). Kunci itu punya akses penuh ke seluruh akun dan tidak bisa dipakai CI. Cloudflare menjawabnya dengan error `Rate limited [code: 10429]`, sehingga terlihat seperti kena limit padahal kuncinya salah (D-029). Untuk setiap produk baru, pakai API Token seperti langkah di atas.

**B. Simpan token ke GitHub**, langsung dari Terminal, tanpa lewat chat. Jalankan di folder proyek (`~/ASF`) **setelah agent membuat repo GitHub-nya**:
```bash
gh secret set CLOUDFLARE_API_TOKEN
```
Terminal akan meminta nilainya. Tempel token, lalu tekan Enter. Isinya tidak tampil di layar.

`CLOUDFLARE_ACCOUNT_ID` bukan rahasia; agent yang mengisinya.

**C. Untuk produk berikutnya: simpan sekali, pakai di semua repo.** Simpan token dan account ID di file `~/.config/factory/.env.shared` di Mac-mu (di luar repo mana pun). Setelah itu, setiap repo produk baru cukup menjalankan `pnpm setup-secrets` di foldernya, tanpa menempel token lagi. Isinya tidak pernah ditampilkan. Cara membuat file itu, isi yang boleh, dan cara mengganti token ada di `docs/SECRETS.md`.

Catatan: Cloudflare sedang mengganti model izin Workers (sejak 15 Sep 2026). Kalau deploy pertama gagal karena izin, agent akan memberi tahu izin apa yang perlu ditambah.

---

## 10. Meta (Facebook/Instagram Ads) — Pixel + Conversions API (per produk, saat mau pasang iklan)

Tanpa langkah ini produk tetap jalan: tidak ada Pixel, tidak ada banner izin iklan, dan tidak ada data yang dikirim ke Meta.

1. **Akun bisnis.** Buka <https://business.facebook.com> lalu buat **Business Portfolio** (nama usaha, email kerja). Lengkapi info bisnis (nama legal, alamat) kalau diminta.
2. **Akun iklan.** Pengaturan bisnis → **Akun → Akun iklan → Tambah → Buat akun iklan baru**. Pilih mata uang **IDR** dan zona waktu **Asia/Jakarta**; keduanya tidak bisa diubah nanti. Tambahkan metode pembayaran di **Penagihan**.
3. **Pixel (dataset).** Buka **Events Manager** → **Hubungkan sumber data → Web** → beri nama (misalnya nama produk) → buat. Salin **ID Pixel/Dataset** (angka saja). ID ini **publik** dan aman dikirim ke chat. Agent memasukkannya ke `product.config.ts` → `marketing.metaPixelId`.
4. **Token Conversions API.** Di Events Manager, pilih dataset tadi → **Pengaturan** → bagian **Conversions API** → **Buat token akses**. Token hanya muncul sekali. **Jangan kirim ke chat.** Simpan ke Worker **produksi**. Salin token-nya, lalu Run di repo produk (cara di langkah 2a):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put META_CAPI_TOKEN --env=""
   ```
5. **Mode tes (untuk uji coba).** Events Manager → dataset → **Uji peristiwa (Test events)** → salin kodenya (misalnya `TEST12345`). Salin, lalu simpan sementara:
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put META_TEST_EVENT_CODE --env=""
   ```
   Setelah tes selesai, **hapus** kode tes itu. Kalau tidak, event asli ikut ditandai sebagai tes. Langkah ini harus kamu jalankan sendiri, karena agent tidak boleh menghapus secret:
   ```bash
   pnpm --filter @factory/api exec wrangler versions secret delete META_TEST_EVENT_CODE --env=""
   ```
   Penghapusannya aktif pada rilis produksi berikutnya lewat CI.
6. **Domain.** Saat produk sudah punya domain sendiri: Pengaturan bisnis → **Keamanan merek → Domain** → tambahkan dan verifikasi domain (lewat meta-tag atau DNS). Domain `workers.dev` tidak bisa diverifikasi.
7. Secret baru aktif pada rilis produksi berikutnya lewat CI, sama seperti secret lain.

Aturan iklan: ikuti **Meta Advertising Standards** dan pagar di `CLAUDE.md`. Artinya tidak ada foto sebelum/sesudah tubuh, tidak ada klaim turun berat badan atau klaim medis, dan landing page harus mengulang janji iklan persis.

---

## 11. OpenAI — model AI (per produk, hanya kalau `product.config.ts` punya `ai`)

Tanpa langkah ini produk tetap jalan di lokal dan preview dengan jawaban **tiruan (mock)**. Di produksi, fitur AI menjawab "sedang tidak tersedia" sampai key dipasang.

1. Buka <https://platform.openai.com> → **Projects** → buat project baru dengan nama produk (misalnya "Myna Fit"). Satu project per produk, supaya biayanya terpisah.
2. Di project itu: **Limits** → pasang **batas anggaran bulanan** (misalnya US$20), dan nyalakan email peringatan.
3. **Billing**: isi saldo (prepaid). Kalau saldo habis, OpenAI menolak dengan `insufficient_quota`. Pengguna melihat pesan "coba lagi nanti", dan log mencatatnya sebagai `quota`.
4. **API keys** → **Create new secret key** (pilih project tadi). Key hanya muncul sekali. **Jangan kirim ke chat.** Simpan ke Worker produksi. Salin key-nya, lalu Run di repo produk (cara di langkah 2a):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put OPENAI_API_KEY --env=""
   ```
   Untuk mencoba model sungguhan di preview (opsional, memakan saldo), jalankan yang sama dengan `--env preview`.
5. Secret baru aktif pada rilis produksi berikutnya lewat CI.

Biaya per panggilan tercatat di tabel `ai_usage` (micro-USD dari harga resmi). Batas per pengguna per hari dan anggaran harian pengunjung anonim diatur di `product.config.ts` → `ai`.

### 11b. Membandingkan model dengan foto sendiri (`pnpm ai:eval`, opsional, D-085)

Untuk memilih model berdasarkan akurasi yang diukur, bukan tebakan. Panduan lengkap (bahasa Inggris): `docs/AI_EVAL.md`.

1. Kumpulkan 20–50 foto asli (piring campur, jajanan, kemasan depan dan label gizi) ke folder `evals/` di repo produk, plus `evals/expected.json`. Folder ini **tidak ikut ke GitHub** (gitignored). Pakai foto sendiri, atau foto orang lain **hanya dengan izinnya**, dan jangan ada wajah atau data pribadi di foto.
2. Buat key khusus eval di project OpenAI produk (batas anggaran kecil, misalnya US$5). Salin key-nya, lalu Run di Terminal yang sama (key hanya ada di jendela Terminal itu, tidak disimpan ke file):
   ```bash
   export OPENAI_API_KEY="$(pbpaste)"
   ```
3. Run (perkiraan biaya muncul dulu; di atas Rp 20.000 perlu `--yes`):
   ```bash
   pnpm ai:eval
   ```
4. Tabel hasil ada di layar dan di `evals/results/`. Tutup jendela Terminal setelah selesai.

---

## 11c. OpenRouter — satu key untuk banyak model (per produk, hanya kalau `ai.provider` = `"openrouter"`, D-083)

Dipakai untuk membandingkan model (misalnya Gemini lawan GPT) dengan satu key. Tanpa key: lokal dan preview memakai jawaban tiruan, produksi menjawab "sedang tidak tersedia".

1. Buka <https://openrouter.ai> → masuk → **Credits** → isi saldo (misalnya US$10). Pembelian lewat kartu kena biaya sekitar 5,5%. Kalau saldo habis, OpenRouter menolak (402) dan log mencatat `quota`.
2. **Privasi** (<https://openrouter.ai/settings/privacy>). Wajib, karena produk mengirim foto dan data pengguna:
   - **Matikan** semua pilihan yang mengizinkan penyedia yang **boleh melatih model** dengan data kamu (untuk model berbayar dan gratis).
   - **Nyalakan ZDR** (Zero Data Retention: penyedia tidak menyimpan data) untuk semua grup model, terutama kalau produk memakai data kesehatan. Kode juga meminta ZDR di setiap panggilan (`routing.zdr`), tapi pengaturan akun adalah pengaman kedua.
   - **Matikan** "OpenRouter Use of Inputs/Outputs" (diskon 1% tidak sebanding).
   - Di **Observability**, pastikan **Private Input & Output Logging** **mati**, supaya isi permintaan tidak tersimpan di log OpenRouter.
3. **Settings → API Keys → Create key**. Beri nama `<slug>-production`. Isi **credit limit** (batas belanja key ini, misalnya US$20, reset bulanan kalau pilihannya ada). Key hanya muncul sekali. **Jangan kirim ke chat.** Salin key-nya, lalu Run di repo produk (cara di langkah 2a):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put OPENROUTER_API_KEY --env=""
   ```
   Untuk mencoba model sungguhan di preview (opsional, memakai saldo), buat key kedua `<slug>-preview` dengan limit kecil dan jalankan yang sama dengan `--env preview`.
4. Secret baru aktif pada rilis produksi berikutnya lewat CI.

Biaya per panggilan diambil dari jawaban OpenRouter sendiri (`usage.cost`) dan tercatat di `ai_usage`.

---

## 11d. Gemini API langsung dari Google (per produk, hanya kalau `ai.provider` = `"gemini"`, D-084)

Satu pemroses data lebih sedikit dan tanpa biaya perantara. **Hanya pakai key dari project berbayar.** Di tingkat gratis, Google boleh memakai isi permintaan untuk melatih model dan **manusia bisa membacanya**. Syarat Google melarang data pribadi dikirim ke layanan gratis.

1. Buka <https://aistudio.google.com> → **Projects** → buat (atau impor dari Google Cloud) project bernama **"Myna Health"** (atau nama perusahaan/produk).
2. Di kolom **Billing Tier** project itu → **Set up billing** → pilih atau buat akun Cloud Billing perusahaan. Pilih **Prepay** kalau ditawarkan (minimal US$5; saldo habis = permintaan ditolak, tidak ada tagihan kejutan). Kalau saldo habis, log mencatat `quota`.
3. **Pastikan berbayar:** di halaman **API keys**, kolom **Plan** untuk project itu harus **Paid**. Kalau masih Free, jangan lanjut.
4. **Batas belanja:** halaman **Spend** → **Monthly spend cap** → **Edit spend cap** (misalnya US$20). Fitur ini masih eksperimental dan bisa telat sekitar 10 menit, jadi pasang juga **budget alert** di Google Cloud Console → **Billing** → **Budgets & alerts** (email di 50%, 90%, 100%).
5. **API keys → Create API key** di project berbayar itu. Key hanya muncul sekali. **Jangan kirim ke chat.** Salin key-nya, lalu Run di repo produk (cara di langkah 2a):
   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put GEMINI_API_KEY --env=""
   ```
   Untuk mencoba di preview (opsional, memakai saldo), jalankan yang sama dengan `--env preview`.
6. Secret baru aktif pada rilis produksi berikutnya lewat CI.

Kode mengirim `store: false`, jadi Google tidak menyimpan percakapan (tanpa itu disimpan 55 hari). Google tetap menyimpan log terbatas untuk mendeteksi penyalahgunaan. **Untuk pengacara:** syarat Gemini API menyebut layanan untuk keperluan profesional/bisnis, pengguna 18+, dan bukan untuk nasihat medis. Lihat D-084.

---

**Cadangan otomatis (opsional, D-091).** Kalau Gemini sedang tidak bisa dihubungi, produk bisa otomatis memakai penyedia lain lewat `ai.fallback` di `product.config.ts`, misalnya OpenRouter. Cadangan hanya dipakai saat penyedia utama gagal total (gangguan, kuota habis, terlalu banyak permintaan), tidak pernah saat jawabannya salah format. Key cadangan disimpan dengan cara yang sama (langkah 11c untuk OpenRouter). Tanpa key itu, tidak ada cadangan. Halaman privasi otomatis menyebut kedua penyedia.

## 12. Satu domain — app dan situs di satu alamat (per produk, opsional)

Dengan pola ini app dan situs memakai satu alamat yang sama, misalnya `fit.domainmu.id`:

- **Pelanggan:** mengetik domain itu dan langsung masuk ke app (sudah login).
- **Orang baru:** yang belum login melihat halaman landing (`/mulai/`). Pengalihannya diatur oleh `domain.anonymousHome` (D-068).
- **Halaman situs:** harga, artikel, lander iklan, dan halaman legal tetap dilayani oleh Worker situs.

**Yang dikerjakan agent (di repo produk):**

- `product.config.ts`: `domain: { app: "fit.domainmu.id", site: "fit.domainmu.id", anonymousHome: "/mulai/" }`.
- `apps/api/wrangler.jsonc`: domain itu ditaruh paling depan di `AUTH_HOSTS`, supaya tautan di email memakai domain itu.
- `apps/site/wrangler.jsonc`: `routes` untuk setiap path situs. Tes `apps/site/test/one-domain.test.ts` menyebutkan rute yang kurang atau yang menutupi layar app.

**Yang kamu kerjakan (sekali per produk, setelah PR di atas merge):**

1. **Hapus record DNS lama** untuk alamat itu, kalau ada (misalnya A record ke hosting lama). Caranya di Cloudflare: domain → **DNS** → **Records**.
2. **Pasang Custom Domain ke Worker app** (bukan Worker situs): **Workers & Pages** → Worker `<slug>` → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → isi alamatnya → **Add domain**.
   - Lakukan ini **di dashboard saja**, jangan di `apps/api/wrangler.jsonc`. Kalau ditulis di sana, `wrangler dev` mengubah semua request lokal ke alamat produksi, sehingga login lokal dan E2E rusak.
3. **Google login**: di Google Cloud (langkah 4 di atas), buat client baru untuk produk ini, atau tambahkan redirect URI di client yang sudah ada:
   `https://fit.domainmu.id/api/auth/callback/google`
4. **Cek**: buka alamatnya di jendela *incognito*.
   - Harus muncul halaman landing (`/mulai/`).
   - Setelah login, membuka alamat yang sama masuk ke app.
   - `/harga/` menampilkan halaman harga dari situs.

---

## 13. Mencoba app terpasang di HP (ikon di layar utama, D-080)

Tidak perlu akun atau kunci apa pun. Coba di URL preview PR atau di produksi (harus HTTPS; `localhost` di laptop tidak bisa dibuka dari HP).

- **Android (Chrome):** buka alamat app, ketuk sekali di halaman dan tunggu sekitar 30 detik. Lalu menu **⋮** → **Instal aplikasi** (atau **Tambahkan ke layar utama**). Kalau produk memakai `pwa.promptAfter: "payment"`, kartu "Pasang … di HP-mu" muncul sendiri setelah pembayaran sandbox berhasil; tombol **Pasang** membuka dialog instal Chrome.
- **iPhone (Safari):** buka alamat app → ketuk ikon **Bagikan** (kotak dengan panah ke atas) → **Tambah ke Layar Utama** → **Tambah**.
  - App yang dibuka dari ikon di iPhone punya penyimpanan sendiri, terpisah dari Safari. Jadi **perlu masuk sekali lagi** di dalamnya. Dengan kode 6 digit dari email (D-079), cukup salin kodenya dari aplikasi email, tanpa membuka tautan di Safari.
- **Dari Instagram/Facebook/LINE/Gmail:** browser di dalam aplikasi itu tidak bisa memasang. Kartunya menampilkan "Buka di Chrome/Safari untuk memasang" dengan tombol **Salin tautan**.
- Ikon diambil dari `apps/app/assets/icon.png` (PNG persegi, minimal 512 px, idealnya 1024). Ganti file itu, lalu jalankan `pnpm theme`.

---

## 14. Notifikasi Telegram untuk pemilik (per produk, opsional, D-112)

Kamu dapat pesan di Telegram setiap ada pembelian, perpanjangan atau refund, dan kalau mau, ringkasan harian. Email pembeli disamarkan (`er***@gmail.com`) atau tidak ditampilkan sama sekali. Data kesehatan tidak pernah dikirim.

1. **Buat bot.** Di Telegram, buka **@BotFather** → kirim `/newbot` → beri nama (misalnya "Myna Fit Alerts") dan username yang berakhiran `bot`. BotFather membalas dengan **token** (bentuknya `123456789:AA...`). Simpan di password manager.
2. **Sapa bot-mu.** Buka bot itu (tautan dari BotFather) dan tekan **Start** atau kirim pesan apa saja. Tanpa ini bot tidak boleh mengirimimu pesan.
3. **Ambil chat id.** Buka di browser (ganti `<TOKEN>`): `https://api.telegram.org/bot<TOKEN>/getUpdates`. Cari `"chat":{"id":123456789,...}`: angka itu chat id-mu.
4. **Simpan ke Worker produksi.** Salin token ke clipboard, lalu jalankan dari mana saja di repo produk:

   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put TELEGRAM_BOT_TOKEN --env=""
   ```

   Lalu salin chat id ke clipboard:

   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put TELEGRAM_CHAT_ID --env=""
   ```

   (Opsional, untuk mencoba di preview dengan pembayaran sandbox: ulangi dengan `--env preview`.)
5. **Nyalakan di `product.config.ts`** (lewat PR, biasanya dikerjakan Claude):

   ```ts
   notifications: { telegram: { events: ["purchase", "renewal", "refund"], email: "masked", dailySummaryHourWib: 8 } },
   ```

   `email: "omit"` kalau tidak mau email sama sekali. `dailySummaryHourWib: null` kalau tidak perlu ringkasan harian. Tambahkan `"webhook_rejected"` ke `events` kalau mau diberi tahu saat ada webhook palsu (paling sering 1× per 10 menit).

Tanpa kedua secret, tidak ada pesan yang dikirim dan semuanya tetap berjalan seperti biasa.

### 14b. Perintah di bot (opsional, D-114)

Bot bisa menjawab perintah dari chat-mu saja: `/hari_ini`, `/minggu`, `/bulan`, `/funnel`, `/sumber`, `/terakhir`, `/bantuan`. Isinya hanya baca: angka yang sama dengan dashboard /admin, dengan email disamarkan. Chat lain tidak dijawab sama sekali.

1. **Buat secret webhook** (acak, cukup sekali). Perintah ini menyalin 64 karakter acak ke clipboard:

   ```bash
   openssl rand -hex 32 | tr -d '\n' | pbcopy
   ```

2. **Simpan ke Worker produksi** (clipboard masih berisi secret tadi):

   ```bash
   pbpaste | pnpm --filter @factory/api exec wrangler versions secret put TELEGRAM_WEBHOOK_SECRET --env=""
   ```

3. **Nyalakan di `product.config.ts`**: tambahkan `commands: true` di `notifications.telegram` (lewat PR, biasanya dikerjakan Claude).
4. **Sambungkan:** setelah deploy, buka **/admin → Bot Telegram → Sambungkan bot**. Worker mendaftarkan webhook dan menu perintah ke Telegram memakai secret yang sudah tersimpan, jadi token tidak pernah keluar dari Worker.
5. Coba kirim `/bantuan` ke bot-mu.


## Ringkasan: yang perlu disimpan di password manager

| Dari | Nilai | Dipakai di fase |
|---|---|---|
| Duitku sandbox | Kode Merchant, API Key | 4 |
| Pakasir (per produk) | Slug, API Key, Webhook Secret | saat `payments.provider` = `"pakasir"` |
| Google | Client ID, Client Secret | 3 |
| Resend | API Key | 3 |
| OpenPanel | Client ID | 6–7 |
| Sentry | DSN web, DSN api | 7 |
| OpenAI (per produk) | API key (project produk) | saat produk memakai AI |
| OpenRouter (per produk) | API key dengan credit limit | saat `ai.provider` = `"openrouter"` |
| Google AI Studio (per produk) | Gemini API key (project berbayar) | saat `ai.provider` = `"gemini"` |

Nama variabel persisnya akan ada di `.dev.vars.example` saat fasenya tiba.
