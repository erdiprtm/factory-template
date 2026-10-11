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
7. **Simpan ke Cloudflare** (jalankan di folder `~/ASF/apps/api`; tempel nilainya saat diminta, isinya tidak tampil di layar). Setiap perintah dijalankan dua kali, untuk preview dan produksi:
   ```bash
   pnpm exec wrangler versions secret put DUITKU_MERCHANT_CODE --env preview
   ```
   ```bash
   pnpm exec wrangler versions secret put DUITKU_API_KEY --env preview
   ```
   Lalu ulangi kedua perintah **tanpa** `--env preview` untuk produksi. Mode tetap **sandbox** sampai kamu sendiri memutuskan pindah ke produksi.
8. **Cara mensimulasikan bayar di sandbox:** pilih **Virtual Account** di halaman bayar, salin nomor VA-nya, lalu buka <https://sandbox.duitku.com/payment/demo/demosuccesstransaction.aspx> dan masukkan nomor VA tersebut. Untuk QRIS ShopeePay ada aplikasi Shopee *staging* (link di dokumentasi Duitku). DANA/OVO sandbox tidak punya simulator resmi.

Catatan untuk nanti (bukan sekarang): pindah ke produksi butuh verifikasi dokumen. Untuk merchant perorangan: KTP, NPWP, dan rekening bank; untuk badan usaha: dokumen PT.

Sumber: <https://docs.duitku.com/pop/en/>

### 3b. DOKU sandbox (opsional, hanya kalau produk memakai DOKU)

Template mendukung DOKU Checkout sebagai penyedia kedua. Langkah ini **hanya** perlu kalau di `product.config.ts` tertulis `payments: { provider: "doku", ... }`. Kalau masih Duitku, lewati.

1. Daftar akun sandbox: <https://dashboard.doku.com/> → pilih **Sandbox** saat mendaftar/masuk.
2. Di Back Office: **Integration → API Keys**. Salin dua nilai ini ke password manager:
   - **Client ID** (contoh bentuknya `BRN-xxxx-xxxxxxxxxxxx`)
   - **Secret Key** (bukan *Public Key*)
3. **Notification URL** (wajib, beda dengan Duitku): DOKU tidak menerima alamat callback per transaksi, jadi harus diisi di dashboard **untuk setiap channel** yang dipakai. Buka **Settings → Payment Settings**, lalu untuk Virtual Account, e-Wallet, QRIS, dan lainnya klik **CONFIGURE** dan isi:
   - Preview: `https://factory-template-preview.erdiprtm.workers.dev/api/webhooks/doku`
   - Produksi (akun produksi, nanti): `https://factory-template.erdiprtm.workers.dev/api/webhooks/doku`

   Catatan: satu akun sandbox hanya punya satu Notification URL per channel, jadi notifikasi sandbox masuk ke **preview** Worker yang tetap (bukan URL `pr-<n>`).
4. **Metode pembayaran:** halaman DOKU Checkout menampilkan semua channel yang aktif di akun. Aktifkan yang dipakai produk (QRIS, e-wallet, Virtual Account).
5. **Simpan ke Cloudflare** (di folder `~/ASF/apps/api`; tempel nilainya saat diminta):
   ```bash
   pnpm exec wrangler versions secret put DOKU_CLIENT_ID --env preview
   ```
   ```bash
   pnpm exec wrangler versions secret put DOKU_SECRET_KEY --env preview
   ```
   Lalu ulangi **tanpa** `--env preview` untuk produksi. Mode tetap **sandbox** (`DOKU_MODE`) sampai kamu sendiri memutuskan pindah.
6. **Simulasi bayar:** pilih Virtual Account di halaman DOKU, lalu ikuti petunjuk simulasi pembayaran sandbox di dokumentasi DOKU (agen belum memverifikasi letak menunya; kabari kalau tampilannya beda).

Sumber: <https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration> dan <https://developers.doku.com/get-started-with-doku-api/notification/setup-notification-url>

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
4. **Client Secret** (dibuat bersama client). Jangan kirim ke chat. Simpan ke Worker **produksi** saja, untuk event dari server (pembayaran, pengingat). Jalankan di `~/ASF/apps/api`, lalu tempel saat diminta:
   ```bash
   pnpm exec wrangler versions secret put OPENPANEL_CLIENT_SECRET --env=""
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
5. **Simpan ke Cloudflare** (di folder `~/ASF/apps/api`; tempel key-nya saat diminta):
   ```bash
   pnpm exec wrangler versions secret put RESEND_API_KEY --env preview
   ```
   ```bash
   pnpm exec wrangler versions secret put RESEND_API_KEY
   ```
   Perintah ini **tidak men-deploy apa pun**; secret ikut aktif di deploy CI berikutnya. Kalau wrangler menyarankan `wrangler versions deploy`, **jangan** jalankan (deploy hanya lewat CI).

Sumber: <https://resend.com/pricing>, <https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>

---

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

Catatan: Cloudflare sedang mengganti model izin Workers (sejak 15 Sep 2026). Kalau deploy pertama gagal karena izin, agent akan memberi tahu izin apa yang perlu ditambah.

---

## Ringkasan: yang perlu disimpan di password manager

| Dari | Nilai | Dipakai di fase |
|---|---|---|
| Duitku sandbox | Kode Merchant, API Key | 4 |
| Google | Client ID, Client Secret | 3 |
| Resend | API Key | 3 |
| OpenPanel | Client ID | 6–7 |
| Sentry | DSN web, DSN api | 7 |

Nama variabel persisnya akan ada di `.dev.vars.example` saat fasenya tiba.
