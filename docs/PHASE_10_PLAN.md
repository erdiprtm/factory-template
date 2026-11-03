# Phase 10 plan: native apps

Status: **accepted by Erdi 2026-11-04** (decisions in §8 and D-119). A1 (SDK 58) and A2 (native config) are done; the rest is not built yet.

Facts were checked against official docs on 2026-11-04 (sources in §10). Items marked ⚠ could not be confirmed and need a check before building. Everything here is template-owned, so every product gets it through `/sync-template`.

**First product: Myna Fit.** It is live, needs no health data, and only needs its photo scan to work on native. **Myna Run** comes after: it adds the health-data module (Part C), which its spec is still shaping.

---

## 1. Plan in one view

| Part | What | For | My work | Calendar, if the accounts are ready |
|---|---|---|---|---|
| **A. Android base** | SDK 58, native config, EAS, native sign-in, web→app hand-off, CI to Play internal testing, (push) | Every product, Myna Fit first | 10–17 h | 2–3 days |
| **B. iOS** | Sign in with Apple, IAP (non-renewing), iOS config, TestFlight | Every product | 10–14 h | ~2 days + Apple review 1–3 days |
| **C. Health data** | Health Connect, HealthKit, `health_*` tables, Huawei cloud adapter, (Strava display-only) | Myna Run, later others | 5–8 days | 2–3 weeks; Huawei approval sets the pace |
| **D. Store billing extras** | Play prepaid plans + RTDN (optional) | Later, if many installs come straight from Play | 3–4 days | — |

- **Order:** A, then B, then C, then D. A and B unlock Myna Fit. C is planned now but built when the Myna Run spec is final.
- **Per product:** after each part, the product syncs and adds a native version of its own `*.web.tsx` features. For Myna Fit, that's the photo pick/upload in `features/scan/upload.web.ts`: about ½–1 day, done by Agent Fit.

---

## 2. What exists today

- **App** (`apps/app`):
  - Expo SDK 57 (RN 0.86) with expo-router, exported for web only.
  - Native-ready by rule: browser APIs only in `*.web.tsx`, native storage through `kv` (D-060).
  - `app.config.ts` has a `scheme`, but no bundle id, no package and no `eas.json`.
  - SDK 58 (RN 0.88, iOS 27) is current, so the template is one version behind.
- **Auth:**
  - Better Auth 1.7.6: magic link, 6-digit email code (D-079), optional Google, cookie sessions.
  - The app's auth client already marks where `expoClient` goes.
- **Billing:**
  - `entitlements.source` already allows `app_store` and `play_store`.
  - `requireAccess()` doesn't care where the user paid.
  - Hard rule: native never shows web prices or web checkout links.
- **Scheduling:** one `*/30` cron in production. No Queues yet.

---

## 3. Part A: Android base (template)

Each step is its own PR, with tests, a DECISIONS entry, STATUS and `pnpm verify`.

| Step | Contents | My work |
|---|---|---|
| A1 | **Expo SDK 58 upgrade** with `expo install --fix`, keeping NativeWind, the pnpm isolated install and the Metro singletons (D-023) working. Web E2E is the safety net. Riskiest step, so it goes first and alone. | 2–4 h |
| A2 | **Native config:** a `native` block in `product.config.ts` (`android.package`, `ios.bundleIdentifier`, store URLs, permission texts). `pnpm theme` writes it into `app.config.ts`. Also `eas.json` (development / preview / production), `runtimeVersion: fingerprint`, `expo-dev-client`, and a dev build installed on Erdi's phone. | 2–3 h |
| A3 | **Native sign-in**, `@better-auth/expo` pinned to the same version as `better-auth`. The session lives in `expo-secure-store`. Production `trustedOrigins` gets only the app scheme, never `exp://`. The screen leads with **"Masukkan kode"** (email code works natively as is). Google sign-in uses an ID token (`clientId` as an array of web, Android and iOS ids). | 2–3 h |
| A4 | **Web→app hand-off** (details below), plus `/.well-known/assetlinks.json` and `apple-app-site-association` generated from config and served by the Worker. Also the app funnel events `app_cta_shown`, `app_store_clicked` and `app_signed_in {platform}`, first-party only. | 1–2 h |
| A5 | **CI** `native.yml`, run manually or on a `native-v*` tag: `eas build` (on Expo's servers, `--no-wait`, so few Actions minutes), then `eas submit` to **Play internal testing** only. The production release stays a human click in the Play Console. No `deploy` script in any `package.json`. | 1–2 h |
| A6 | *(optional for Myna Fit)* **Push:** `expo-notifications`, `push_tokens` + `notification_prefs` tables, the user's timezone (WIB, WITA or WIT), the existing cron feeding a `JOBS` Queue, a sender with Expo receipts that drops dead tokens, and a product hook in `features/jobs.ts`. No health numbers in push text, and opt-out in Akun. | 2–3 h |

**Hand-off without a third-party SDK:**

1. After signup or payment, the web shows "Lanjut di aplikasi", the store button and a **6–8 character code**: single use, 10 minutes, hashed, rate-limited.
2. The app's first screen offers "Punya kode dari web?". `POST /api/app/handoff` swaps the code for a **new** native session. It never reuses the web cookie and never puts a long-lived token in a URL.
3. Once App Links / universal links are verified, `https://<domain>/app/masuk?c=<code>` opens the app with the code already filled in.

**Android billing in v1: consumption-only** (Google allows it: "Google Play allows any app to be consumption-only").

- Web buyers sign in and use what they paid for.
- The app shows no price, no link and no button to web checkout. One plain sentence, without a link, is allowed, e.g. "Paket dikelola lewat akun kamu di web".
- A user who installs straight from Play can start the trial. When it ends, they see "akses berakhir" with no prices.
- No Play Billing in v1. Part D adds it if needed.

**Play listing requirements:**

- Data safety form.
- In-app account deletion (exists) plus a web deletion URL: a site page `/hapus-akun` that points to Akun.
- Target API 36.
- Health apps declaration. Every app must fill it in; Myna Fit falls under "Nutrition and Weight Management".

---

## 4. Part B: iOS (template)

| Step | Contents | My work |
|---|---|---|
| B1 | **Sign in with Apple**: `expo-apple-authentication` and Better Auth's `apple` provider with an ID token (`appBundleIdentifier`, a client-secret JWT that is renewed every ≤ 6 months). Required by guideline 4.8 when Google is offered. With only the email code, it isn't. | 2–3 h |
| B2 | **IAP**: non-renewing products for each plan in `product.config` (`iap.ios` ids), a "Pulihkan pembelian" button, and App Store Server Notifications V2 → `entitlements` (source `app_store`), re-checked with the App Store Server API before access is granted. Extension logic is the same as for DOKU, so prepaid months stack. | 5–8 h direct, or 3–4 h via RevenueCat |
| B3 | **iOS config:** `associatedDomains`, permission texts (camera/photos for scan), privacy manifest. The CI job gets `eas submit` to **TestFlight**. | 2–3 h |

**Why IAP is required on iOS:**

- Guideline 3.1.3(b) lets users access what they bought on the web "provided those items are also available as in-app purchases within the app".
- In Indonesia the app and its App Store page may show no web price, no link and no "beli di web".
- Email and WhatsApp outside the app may still mention the web.

**Commission:** 15% under the Small Business Program (up to US$1M a year). IAP prices follow Apple's Rupiah price tiers.

**Review notes for Myna Fit:**

- 1.4.1: remind the user to consult a professional, and show where numbers come from. Both are already done by the template rules (labels, "bukan pengganti tenaga profesional").
- 5.1.1(v): in-app account deletion exists.
- Screenshots must not mention the web price or DOKU.

---

## 5. Part C: health data (template, for Myna Run)

Built after the Myna Run spec is final. Estimates: Health Connect + server tables 5–7 days, HealthKit 2–3 days, Huawei 3–5 days.

**What the research found:**

1. **Strava data cannot feed AI.**
   - Strava API Policy, effective 2026-06-01, §5.3: no Strava data "in connection with the development, training, evaluation, or operation of any AI Application".
   - Also §5.4 (no "analytics, analyses, customer insight generation"), §5.8 (no charging for Strava data) and §3.3 (Standard tier needs an active Strava subscription).
   - So Strava is at most display-only, after written confirmation from Strava. It is never used in the debrief or the score.
2. **HRV is often missing on Android.**
   - Samsung writes neither HRV nor resting HR to Health Connect. Huawei doesn't write to Health Connect at all. Garmin's Health Connect list has no HRV.
   - Scores must work from resting HR + sleep, with HRV as a bonus.
   - Android HRV is RMSSD and iOS HRV is SDNN. They aren't comparable, so each gets its own column and baseline.
3. **History and timing differ by platform.**
   - Health Connect gives 30 days by default; `READ_HEALTH_DATA_HISTORY` lifts that. Check `getFeatureStatus` at runtime, because older phones may lack it.
   - HealthKit gives the full history, unless the user limits it (iOS 27).
   - Background sync works on both, but not reliably, so the app always syncs on open as well.
4. **Huawei, the #1 brand, needs its cloud REST API.**
   - What's known: HUAWEI ID OAuth, test scopes for 100 users, then a verification review.
   - Exact scopes, history depth and Indonesia availability are unverified ⚠. Apply under the PT now.

**Design:**

- **Phone:**
  - One `HealthSource` interface: `react-native-health-connect` 4.1.3 on Android, `@kingstinct/react-native-healthkit` 16.2.0 on iOS, nothing on web.
  - Reads only the types the product declares in `native.health.types`.
  - Shows a rationale screen before the OS dialog.
  - Paid features never depend on granting a permission.
- **Server:**
  - `POST /api/health/batch` writes `health_samples`: raw, normalised, with `metric`, `value`, `unit`, `method`, local timezone offset, `platform`, `source_app`, and a unique `external_id` so re-syncs are idempotent.
  - That rolls up into `health_daily`: per local day, one chosen source per metric, never summed across apps, with the source stored per field.
  - `health_workouts` holds runs. `health_connections` holds the status and **encrypted** cloud tokens (AES-GCM with a Worker secret).
  - Core offers baseline helpers; the score formula is product-owned.
- **Cloud adapters** share one interface: authorize, callback, refresh, webhook, backfill through a Queue, revoke. Huawei is first; Strava is optional, display-only.
- **Privacy (UU PDP, specific data):**
  - Explicit consent before the first read.
  - Export and account deletion cover `health_*` and revoke tokens.
  - Raw data kept 90 days, daily rows until deletion.
  - Never sent to Meta, ads or analytics. Only the summary a feature needs goes to the AI provider.
- **Stores:**
  - Play: the Health Connect permissions declaration, one justification per type, and the same privacy policy in the rationale screen.
  - Apple: HealthKit and background-delivery entitlements, `NSHealthShareUsageDescription`, and HealthKit stated in the description (2.5.1).
  - Not in scope: writing data back, routes and maps, watch apps.

---

## 6. Part D: Play Billing (optional, later)

- Play prepaid plans (3- and 6-month base plans, non-renewing, acknowledged within 3 days).
- Real-time developer notifications via a Pub/Sub push to the Worker, re-checked with the Play Developer API, writing `entitlements` with source `play_store`.
- Once the app sells in-app, it must not mention the web at all. The exception is joining Indonesia's User Choice Billing, which reduces the fee by 4%.
- Worth it only if /admin shows many direct Play installs that never buy on the web.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| The SDK 58 upgrade breaks NativeWind or the pnpm install | Its own PR first (A1), with web E2E as the safety net |
| iOS rejected for no IAP, or for a web mention in the app or screenshots | IAP in the first public iOS build; a screenshot checklist in `/launch-check` |
| Play review slow (no published timeline) | Upload to internal testing early; fill in the forms before the first production release |
| Personal Play account: 12 testers × 14 days before production | Use an organization account (needs D-U-N-S), or start the closed test the day the account exists |
| Myna Fit's scan only exists as `upload.web.ts` | A native version with `expo-image-picker` / camera in Myna Fit's features (Agent Fit) |
| EAS free tier: 15 builds per platform per month, low priority | Starter at US$19/month when builds get frequent |
| Part C: HRV missing, Huawei approval slow, Strava terms | See §5. The Myna Run spec designs around them |

---

## 8. Decisions (Erdi, 2026-11-04)

1. **Order:** Android and iOS together (A and B).
2. **Play account:** organization under PT Myna Bio Teknologi (Erdi creates it; needs D-U-N-S).
3. **Apple account:** organization under the PT (Erdi creates it).
4. **iOS IAP:** RevenueCat, its webhook writing our own entitlements. IAP price: to be set with the products.
5. **Google sign-in on native:** yes, so Sign in with Apple is built too (4.8).
6. **Push (A6):** later.
7. **Myna Run (Part C):** decided in the Myna Run spec.

---

## 9. Langkah manusia (Erdi)

Mulai sekarang, karena ini yang paling menentukan jadwal:

1. **Expo**: buat akun dan organisasi, lalu simpan token sebagai secret GitHub `EXPO_TOKEN`. Ini cukup untuk memasang build uji di HP Android kamu.
2. **D-U-N-S untuk PT Myna Bio Teknologi**, gratis, butuh beberapa hari sampai minggu. Hanya perlu kalau memilih akun organisasi.
3. **Google Play Console**: US$25 sekali bayar, verifikasi identitas atau bisnis, lalu buat app Myna Fit. Saya akan menulis langkah membuat service account untuk `eas submit`.
4. **Apple Developer Program**: US$99 per tahun. Di App Store Connect, setujui Paid Apps Agreement, isi data bank dan pajak, lalu daftar Small Business Program.
5. **Firebase**: buat project untuk push Android. Hanya perlu kalau A6 jadi.
6. **Untuk Myna Run (nanti)**: ajukan Huawei Health Kit dengan data PT, tanyakan ke pengacara soal consent data kesehatan dan AI, dan siapkan 5–10 penguji dengan merek jam yang berbeda.

Saya tidak pernah memegang key, sertifikat, atau token. EAS menyimpan keystore dan sertifikat. Semua secret di-set oleh Erdi.

---

## 10. Sources (read 2026-11-04)

- **Expo:**
  - SDK 58: https://expo.dev/changelog/sdk-58
  - EAS pricing: https://expo.dev/pricing
  - Monorepos: https://docs.expo.dev/guides/monorepos/
  - Building on CI: https://docs.expo.dev/build/building-on-ci/
  - Submit, Android: https://docs.expo.dev/submit/android/
  - Submit, iOS: https://docs.expo.dev/submit/ios/
  - Push: https://docs.expo.dev/push-notifications/sending-notifications/
  - Universal links: https://docs.expo.dev/linking/ios-universal-links/
  - App Links: https://docs.expo.dev/linking/android-app-links/
- **Better Auth:**
  - Expo: https://better-auth.com/docs/integrations/expo
  - Apple: https://better-auth.com/docs/authentication/apple
  - Google: https://better-auth.com/docs/authentication/google
- **Apple:**
  - App Store Review Guidelines (3.1.1, 3.1.3(b), 4.8, 5.1.1, 1.4.1, 2.5.1): https://developer.apple.com/app-store/review/guidelines/
  - Small Business Program: https://developer.apple.com/app-store/small-business-program/
  - Enrollment: https://developer.apple.com/programs/enroll/
- **Google Play:**
  - Consumption-only: https://support.google.com/googleplay/android-developer/answer/10281818
  - Payments: https://support.google.com/googleplay/android-developer/answer/9858738
  - User choice billing: https://support.google.com/googleplay/android-developer/answer/13821247
  - Testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
  - Target API: https://support.google.com/googleplay/android-developer/answer/11926878
  - Health apps declaration: https://support.google.com/googleplay/android-developer/answer/14738291
  - Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
  - Prepaid plans: https://developer.android.com/google/play/billing/subscriptions
  - KPPU ruling upheld (Mar 2026): https://www.thejakartapost.com/business/2026/03/15/supreme-court-rejects-googles-final-appeal-in-payment-system-case
- **Cloudflare:**
  - Workers limits: https://developers.cloudflare.com/workers/platform/limits/
  - Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- **Strava:**
  - API Policy (§3.3, §5.3, §5.4, §5.8 checked directly): https://www.strava.com/legal/api_policy
  - Webhooks: https://developers.strava.com/docs/webhooks/
  - Rate limits: https://developers.strava.com/docs/rate-limits/
- **Health Connect:**
  - Data types: https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types
  - Read data: https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
  - Declare access: https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
  - Samsung: https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
  - Polar: https://support.polar.com/en/flow-app-health-connect
- **HealthKit:**
  - Types: https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier
  - Libraries: https://github.com/matinzd/react-native-health-connect, https://github.com/kingstinct/react-native-healthkit
- **Huawei Health Kit:**
  - REST overview: https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/overview-restful-api-0000001050071695
  - Access process: https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/access-process-0000001624467736
- **RevenueCat:**
  - Pricing: https://www.revenuecat.com/pricing/
  - Prepaid plans: https://www.revenuecat.com/docs/subscription-guidance/google-prepaid-plans
