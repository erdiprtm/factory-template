# Myna Run — Spec v1

## One-liner
Myna Run reads the watch (or phone) data of people who run **or walk** for their health and shows, in plain Bahasa Indonesia, whether it's actually making them healthier: a daily recovery score, today's right session and step target, and their heart-fitness trend. The name stays Myna Run (Erdi, 2026-11-04) even though walking is included.

## Target user & problem
- **Who:** two segments, measured separately in /admin:
  - **Runners:** adults 25–40 in Indonesian cities who run 2–4× a week **for their health**, already own a smartwatch (Xiaomi/Redmi, Huawei, Samsung, Amazfit, Garmin, Apple Watch), and sometimes join a fun run or race.
  - **Walkers** (added by Erdi 2026-11-04): adults and families who walk or "jog" at a walking pace, e.g. weekend mornings or car-free day, to hit a daily step target. Many wear a cheap band (Xiaomi/Redmi, Huawei) or only carry a phone.
  - Evidence: walking apps are among the best earners in Health & Fitness on ScreensDesign (StepsApp ≈ $550k/month, WalkFit ≈ $300k, Pacer ≈ $250k, Sep 2026).
- **Pain:**
  - Their watch records many numbers (HR, HRV, sleep, VO₂max, steps), but they don't know what they mean or whether their running or walking is working.
  - Walkers chase "10.000 langkah" without knowing it's a marketing number; a 2025 Lancet Public Health meta-analysis found most of the benefit already around 7,000 steps a day.
  - Social media gives too many conflicting tips ("too many insights about running on social media", a Runna review from Indonesia), so they run without structure, often too hard, and get tired or hurt.
  - Running apps sell speed and distance, not health. Foreign apps are expensive (Strava + Runna bundle Rp899.999/year).
  - Trust: the top complaint in Strava's Indonesian 1–3★ reviews is e-wallet money taken by an automatic renewal after a trial.
- **Today:** they read their watch app's raw numbers, copy friends' or YouTube plans, ask in running-club WhatsApp groups, or pay a coach.
- **Research:** `/Users/erdipratama/myna-run/research/` (Crenoe teardown, strategy v2, cost model, ScreensDesign research of StressWatch, Bevel, Athlytic and Runna).

## Core features (v1 — max 3)
1. **Morning recovery + today's session** (the core loop).
   - **Recovery score 0–100%** from **resting HR + sleep**, with **HRV as a bonus input when the watch provides it** (decided by Erdi 2026-11-04). It's **compared with the user's own 60-day baseline** (as Athlytic and Bevel do), computed in code once a day after waking. The screen says which inputs were used.
     - HRV is often missing on Android: Samsung writes no HRV or resting HR to Health Connect, and Garmin lists no HRV (`docs/PHASE_10_PLAN.md` §0).
     - Android HRV (RMSSD) and iOS HRV (SDNN) keep separate baselines.
     - When resting HR is missing, it's estimated from overnight heart rate and labelled "perkiraan".
   - **Today's session** follows the score: "santai" (easy, zone 2), "sedang" or "panjang", with an HR range and a heat-adjusted pace for the user's usual run time (weather from MET Norway / Open-Meteo). Walkers get walking sessions instead, e.g. "jalan cepat 30 menit" in zone 2.
   - **Today's step target** for everyone: personal, starting from the user's own 14-day average and rising slowly toward 7,000–8,000 steps ("Kemarin 5.200 langkah, hari ini target 5.800"). Steps work from a phone alone, without a watch: iPhone counts into HealthKit by itself; Android 14+ counts into Health Connect only from the moment Myna gets the steps permission (no older history). Older Android needs Samsung Health or Google Fit writing steps.
     - **"Belum ada data langkah" state:** when there are fewer than 3 days of steps, the screen says so and shows how to start counting. Myna never guesses a target.
   - **Morning reminder** around the user's usual run or walk time: a local scheduled notification on the phone (ASF Phase 10 step A6a, no server push in v1), with opt-out in Akun.
     - Default text has no health number: "Cek pemulihanmu sebelum lari".
     - The number ("Pemulihanmu 82% · hari ini boleh lari sedang") shows only when the user turns on "Tampilkan angka di notifikasi" in Akun (default off, because a lock screen is visible to others), and only if today's score is already synced. (Decided by Erdi 2026-11-04, Agent ASF's proposal.)
2. **Debrief after every run or walk.**
   - When a run or walk syncs, Mina shows 2–3 sentences: time in each HR zone, pace, the heat's effect and what it means for tomorrow ("25 menit di zona 2, ini olahraga yang membangun jantung"). A walk without HR gets steps, duration and pace.
   - Numbers come from the watch data and code. The sentences come from **Bahasa Indonesia templates in code** (no generative AI in v1), with several variants per situation so they don't repeat: recovery high or low, hot day, too long in zone 4+, resting HR falling, HR missing.
3. **Heart-fitness trend + weekly report.**
   - Weekly resting HR, HRV, VO₂max (as reported by the watch) and average steps against the user's own baseline: "HR istirahatmu turun 2 bpm minggu ini", "rata-rata 6.400 langkah, naik 800".
   - A weekly report card that can be shared to an IG Story.

## Core loop & funnel
- **Core loop:** every morning, check the recovery score, today's session and step target → run or walk → see the debrief and its effect on the heart-fitness trend.
- **First 30 seconds** (StressWatch and Bevel patterns, one tap per screen; about 10 quiz and consent screens, then the 12-scene story):
  1. Meta ad → lander `/l/<slug>` whose headline is the ad's hook word for word, with social proof and the CTA "Cek larimu" (walker landers: "Cek langkahmu").
  2. Consent (terms, privacy, sensitive health data), recorded before any processing.
  3. The quiz (below).
  4. The personal result (the web "aha" below).
  5. **"Sehari bareng Myna Run": an animated story of the app, right after the quiz and before the paywall** (Erdi 2026-11-04; Myna Fit's P-124 pattern, `myna-fit` `apps/app/src/features/scan/story/`). It explains every feature and how to use it, and replaces separate education cards and a sample dashboard.
     - **Format:**
       - Bars along the top, like an IG story. Each scene plays for 4–7 s, then the next one starts by itself.
       - Tap right to go forward, left to go back. "Lewati" jumps to the finale.
       - A chapter label sits above each scene: Pagi, Gerak, Hasil, Siap.
       - Every example number is labelled "Contoh" or "Ilustrasi". The user's own numbers come from the quiz: name, age-based zone 2, segment, watch brand, usual time.
       - Runners and walkers see their own version of scenes 4, 7 and 8.
     - **Scenes:**
       1. *Terhubung:* the quiz's watch brand → Health Connect / Apple Health → Myna. HR, sleep and step icons flow in: "Tanpa input manual."
       2. *Notif pagi:* a lock screen at the user's usual time: "Pemulihanmu 82% · hari ini boleh lari sedang".
       3. *Skor pemulihan:* the ring fills 0 → 82%. Chips show HR istirahat, tidur and HRV (bonus) against "normalmu" (education: HR istirahat turun = jantung makin efisien).
       4. *Sesi hari ini:*
          - Runners: "Lari santai 30 menit · HR {zona 2-mu}" plus the heat tweak ("27°C jam 06.00 → pace 10 dtk lebih santai").
          - Walkers: "Jalan cepat 30 menit · HR {zona 2-mu}".
       5. *Hari capek:* the score drops to 41% and today turns into "jalan santai atau istirahat" (education: pemulihan rendah = hari santai, biar tidak cedera).
       6. *Target langkah:* a ring at 5.200 → today's target 5.800, "naik pelan-pelan menuju 7.000". A myth-buster line: "10.000 langkah bukan angka wajib".
       7. *Saat bergerak:* the watch face shows HR in zone 2: "Pakai jammu seperti biasa, tidak perlu buka app" (education: zona 2 = yang paling membangun daya tahan).
       8. *Debrief:* the run or walk syncs, the zone bar fills (70% in zona 2), and Mina's 2–3 sentences type in.
       9. *Tren:* labelled "Ilustrasi". Resting HR goes 64 → 61 bpm over 8 weeks, and steps go up.
       10. *Laporan mingguan:* the weekly card flies into an IG Story frame.
       11. *Pasang app:* the Play Store and App Store badges, then "hubungkan jam, laporan pertama di hari pertama".
       12. *Finale:* a full-bleed photo of a runner and a family walking in a morning car-free-day setting (two photo variants, A/B, as Myna Fit does).
           - Four benefit chips, then the user's plan line: "Zona 2-mu 128–142 bpm · 3 sesi/minggu · target 5.800 langkah".
           - CTA "Yuk, mulai rencanaku", then sign-in, then the paywall with "Coba 7 hari".
     - **Rules:**
       - Built with React Native Animated + react-native-svg and bundled images, so it runs on web and native.
       - Reduced motion shows each scene's end state, and the bars still advance.
       - Every scene shown and every skip are tracked, so the drop-off per scene shows in /admin.
       - The finale counts as the first result.
       - Short lines in Mina's voice. Nothing promises a health outcome ("menurunkan risiko…").
- **The "aha"** (before any payment):
  1. **On the web, after the quiz:** "Erdi, zona 2-mu sekitar 128–142 bpm. Rencana minggu ini: 3 sesi". Max HR from age is labelled "perkiraan".
  2. **In the app on trial day 1:** after the watch connects, Myna reads 30+ days of history and shows the first real report ("HR istirahatmu 62 bpm, turun 3 bpm sejak bulan lalu"). The first real recovery score comes the next morning. Payment is due on day 7.
- **Why they come back tomorrow:** the morning push with the new recovery score and session (the score only exists once a day), the automatic debrief after each run, and the weekly report every Sunday.
- **Quiz (8 questions):**
  1. "Mana yang kamu rasakan?": olahraga tapi tidak tahu efeknya, gampang capek, tidur kurang nyenyak, takut cedera
  2. "Biasanya olahraga apa?": lari, jalan kaki, atau keduanya (sets the segment)
  3. Goal: lebih bugar, tidak gampang capek, turun berat badan, siap fun run atau race
  4. Runs or walks per week
  5. Watch brand (Xiaomi/Redmi, Huawei, Samsung, Amazfit, Garmin, Apple Watch, lainnya, "HP saja")
  6. Usual run or walk time
  7. Age
  8. First name
- **Free uses of the core action before the paywall:** 0. The paywall comes after the first web result. Access is through a 7-day trial ("Coba 7 hari"; never the word "gratis"). There is no free tier.
- **First ad hooks:**
  - "Untuk pelari yang belum tahu larinya bikin sehat atau tidak, dapatkan zona lari dan rencana minggu ini dalam 1 menit."
  - "Untuk yang punya jam pintar tapi bingung baca angkanya, dapatkan artinya dalam bahasa sehari-hari, mulai hari ini."
  - "Untuk yang lari pagi tapi sering capek seharian, dapatkan sesi lari yang pas dengan kondisi tubuhmu, mulai besok pagi."
  - Walkers: "Untuk yang rutin jalan pagi, ketahui apakah langkahmu sudah cukup bikin jantung sehat, dalam 1 menit."

## Paid vs free
- **Trial:** 7 days with every feature, no card, no automatic renewal. After the trial the app locks, and the user's data is kept so they can come back in one tap.
- **Paid (3 or 6 months, prepaid):** everything: daily recovery score and session, daily step target, morning push, debrief after every run or walk, heart-fitness trends, weekly report. Renewal is early-renewal carry-over with reminder emails (template default).

## Plans & prices
- 3 bulan: Rp149.000 (≈ Rp11.500/minggu)
- 6 bulan: Rp249.000 (≈ Rp9.600/minggu), highlighted
- **Gross margin target ≥ 90%** (decided by Erdi 2026-11-04: no generative AI in v1):
  - cost ≈ Rp1.800 per paying user per month (servers + weather), data sources Rp0 (`research/cost_model.py` with AI at 0);
  - margin ≈ 94–96% per package (Play and web).
- **Payments** (Erdi's Phase 10 decisions, `docs/PHASE_10_PLAN.md` §8, 2026-11-04):
  - **Web (main channel):** DOKU. The DOKU KYC is filed last, once the app exists to show.
  - **Android:** consumption-only. No price or link to the web in the app.
  - **iOS:** the same 3- and 6-month plans as non-renewing in-app purchases through RevenueCat, whose webhook writes our own entitlements (App Store guideline 3.1.3(b) when web buyers use the app). IAP prices are set with the products.
  - Play Billing is Phase 10 Part D, later and optional.

## Data the product stores
- **⚠️ Sensitive (health), so `legal.sensitiveDataConsent: true`:** resting HR, HRV, sleep stages and duration, VO₂max, steps, run summaries (date, distance, duration, HR zones, pace, elevation). Each value keeps its source (Health Connect, HealthKit, Huawei Health Kit) and the device.
- Profile: first name, age, goal, usual run time, watch brand, quiz answers.
- OAuth tokens for Huawei Health Kit (encrypted).
- **Not stored in v1:** GPS routes or precise location (only the run summary and the city for weather).
- Account, consent, entitlements, payments and funnel events (template).

## Content & data sources
- **Measured numbers** come from the user's watch, through Health Connect (Android), HealthKit (iOS) and Huawei Health Kit (cloud). The more types and sources, the better. Each number shows its source. No aggregator (Terra etc.) in v1, so data costs Rp0 (`research/wearable-data-research.md`).
- **Strava: not in v1, no integration at all** (decided by Erdi 2026-11-04). No Strava OAuth, no Strava API, no developer subscription.
  - The Strava API Policy (effective 2026-06-01) blocks the useful parts even without AI: §5.4 bans "analytics, analyses, customer insight generation" and combining Strava Data with other data, §5.8 bans charging for access, and §6.2 caps the cache at 7 days.
  - Runs that the user's watch or phone already writes to Health Connect or HealthKit are read like any other source, whatever app recorded them.
- **Not in v1:** Garmin API (v1.1, after Garmin's written permission for a paid app, §5.2(e)), Polar (if users ask). **Never:** Oura, WHOOP, the Samsung Data SDK, the Google Health API.
- **One consent screen** before any health data is read: what is read, from which source, stored where, how to withdraw and delete (Play explicit consent, Apple, UU PDP).
- Huawei users without Health Kit approval yet get manual run entry or FIT upload.
- **Computed in code:** recovery score (HRV + resting HR + sleep vs the user's 60-day baseline), HR zones (Karvonen / %HRmax; age-predicted max HR labelled "perkiraan"), trends, heat-adjusted pace.
- **VO₂max** is shown as the watch reports it, never recomputed.
- **No generative AI in v1** (decided by Erdi 2026-11-04). All text comes from templates in code, so it never invents facts or gives medical advice, and no health data goes to Gemini or OpenRouter. The template's AI adapter stays off. AI may come back later as an opt-in with its own consent, only if retention data shows the templates feel repetitive.
- **Technical terms with a tap-to-explain** (Erdi 2026-11-04: for teens, adults, parents and athletes). The app keeps the real terms (resting HR, HRV, zona 2, VO₂max), and each one is tappable. A tap opens a one-line plain explanation, e.g. resting HR → "detak jantung saat istirahat; makin rendah biasanya makin bugar", HRV → "variasi jarak antar detak jantung; makin tinggi biasanya badan makin segar".
- **Disclaimer** on every insight screen: "Hanya informasi, bukan saran medis." Plus the template's "bukan pengganti tenaga profesional" notice, following StressWatch's and Athlytic's store-approved patterns.
- **Market:** Indonesia first (Bahasa Indonesia, IDR, DOKU, local heat and watch brands), global-ready through the template's `en` locale and store billing.

## Out of scope for v1
- AI chat and any generative AI text
- Strava (any integration)
- Nutrition and weight-loss plans (Myna Fit's job). A walker who picks "turun berat badan" gets steps and zone 2 here, and a link to Myna Fit for food.
- Strength workouts
- Race plans with GPX pacing
- Recording runs in-app (the watch records)
- Wear OS / watchOS apps
- Clubs and social feed
- Any aggregator (Terra, Rook, Thryve…) and the Garmin API
- Countries outside Indonesia for ads

## Launch & distribution
- **Launch date:** after ASF Phase 10 (`docs/PHASE_10_PLAN.md`, draft 2026-11-04).
  - Android path ≈ 16–24 agent-days, about 4–6 calendar weeks, limited by D-U-N-S, Play and Huawei.
  - iOS adds about 1.5–2 weeks.
  - The web is the funnel (quiz, story, zone 2 result, DOKU payment), and real watch-data features live only in the app (decided by Erdi 2026-11-04).
  - Android and iOS are built together (Erdi, Phase 10 §8 #1), with Play and Apple accounts as organizations under PT Myna Bio Teknologi.
- **First channels:** Meta ads (Rp100K/day per ad, `/ad-test-plan`), running communities and clubs, SEO running calculators.
- **Success metric at day 30:** ≥ 20 paying users at blended CAC ≤ Rp120.000 (average order ≈ Rp209.000, target ROAS 1.75).
- **Kill criteria at day 60:** fewer than 30 paying users, or blended CAC above Rp240.000 (2× target) after at least Rp3.000.000 of ad spend. Then stop the ads and rework the funnel or positioning with Erdi. Extra signal: fewer than 20% of trials buying means the day-1 report needs work.

## Open questions
- **Character (decided by Erdi 2026-11-04):** Mina is now a 3D-clay common myna bird (navy, yellow beak and eye mask), the mascot of every Myna product. In Myna Run she wears a coral sweatband and running shoes, and a coral heart character is her sidekick on heart cards. The app icon is Mina's head with the sweatband (`/Users/erdipratama/myna-run/research/characters/`, README there).
  - 3D clay for big moments: app icon, store screenshots, ads, story and finale, paywall, weekly share card, landing page.
  - 2D flat (SVG) for daily in-app UI: the Pagi ring with Mina's 4 moods (semangat, biasa, capek, tidur), debrief, small cards, empty and loading states, notifications. It animates in code (Skia/Reanimated).
- **Palette (decided by Erdi 2026-11-04): A "Matahari pagi"**: coral #FF7A59 (primary), peach #FFE3D6, lavender #C9C3F7, mint #8FDDB4, navy #2A2350 (text and the one dark card). Light mode only, no red, and the sky tint follows the recovery score (coral → lavender → soft blue).
- Which watch brands write HRV, resting HR and sleep to Health Connect: test on friends' watches. Also check whether a resting-HR estimate from overnight HR is good enough for Samsung users.
- Phase 10 decisions are made (`docs/PHASE_10_PLAN.md` §8). Nothing in this spec is waiting on a decision.
- Huawei: ask in writing whether storing and processing Health Kit data on our servers is allowed (§2.1(4)).
- D-U-N-S for PT Myna Bio Teknologi (needed for the Play organization account and Apple), and Huawei Health Kit approval.
- DOKU, done last, once the app can be shown for KYC: its own merchant for Myna Run (the Notification URL is per channel), with QRIS and e-wallets activated before launch.
- Walkers vs runners: compare trial → paid and CAC per segment in /admin before shifting ad spend. Walkers may pay less often than runners.
- Lawyer: privacy and terms for health data (UU PDP: explicit consent, impact assessment), Garmin §5.2(e), Huawei §2.1(4).
- The template states plans as "6 and 12 months"; Myna Run uses 3 and 6 (the config already accepts any `months`).
