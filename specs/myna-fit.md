# Myna Fit — Spec v1

## One-liner
Foto makananmu dan dapatkan kalori serta protein dari Tabel Komposisi Pangan Indonesia, plus program gym yang naik bertahap sesuai goal-mu.

## Target user & problem
- **Who:** adults in Indonesia (18+, women and men) who train at a gym and want to eat in line with a goal (bulking, cutting, maintain).
- **Pain:**
  - They don't know whether a plate of nasi, lauk and sambal has enough protein.
  - Calorie apps don't know Indonesian food, and typing every item is tedious.
  - At the gym they don't know what to lift next or how much to add.
- **Today:** they guess, use MyFitnessPal with foreign data, or keep notes on the phone.
- **History:** Myna Fit has been live on Lovable (`fit.mynahealth.id`) since October 2026. This spec rebuilds it on the factory and improves it.
- **Migration inventory:** `specs/myna-fit.migration.md` (screens, tables, functions, secrets, services, template gaps).

## Core features (v1 — max 3)
1. **Scan makanan with curated numbers** (the core loop).
   - **The model's job:** a meal photo (camera or gallery) goes to the vision model, which only names the foods and estimates grams.
   - **Where the numbers come from:** every kcal/protein/carb/fat value comes from curated data stored in the product, in this order:
     - (1) TKPI items;
     - (2) curated recipes for mixed dishes, computed from TKPI;
     - (3) packaged food: values read from the photographed nutrition label;
     - (4) no match: the nearest curated item shown as "mirip: X".
   - **Before saving:** the user reviews each item, changes the portion (½×, 1×, 1½×, 2×), swaps it via search, adds an item or types one manually, then saves.
   - **Shown after saving:** daily kcal and protein targets with what is left, and the food streak.
   - **Keeps from Lovable:** the scan statuses (`empty`, `not_food`, `unclear`), the draft that survives a reload, edit and delete with "Urungkan", and the meal labels (Sarapan, Makan siang, …).
2. **Program gym with progressive targets.**
   - **The program:** generated from the quiz (63-exercise pool; splits for 2-3, 4-5 and 6+ days; difficulty by level) with day tabs and swap/shuffle per exercise.
   - **Logging sets:** kg, pin or seconds, plus reps and to-failure. Autosave; the rest timer depends on the goal (120/90/60 s); the screen stays on during a session.
   - **Records and targets:** personal records with a "Rekor baru" chip, and next-session targets from double progression (increase, hold, deload, lighter).
   - **Finishing:** "Selesai sesi" shows a summary and moves to the next day. A weekly session target (e.g. "3 dari 4 sesi minggu ini") counts rest days as normal.
   - **Exercise picker:** search and custom exercises.
3. **Beranda and weekly progress.**
   - **Morning summary:** yesterday's kcal and protein against target, plus "Langkah 1 hari ini" (rule-based, numbers from curated data).
   - **Shortcuts:** "Foto makanan" and "Mulai latihan" / "Lanjut latihan".
   - **History:** a 7-day strip, today's meals as photo tiles, and gym history with a per-exercise trend.
   - **Body weight:** log and trend with general guidance ("perkiraan umum").
   - **Profile:** goal, body data and targets; edit goal. Account, export and delete use core `/account`.

## Core loop & funnel
- **Core loop** (the one thing users repeat): photograph a meal → items with grams and numbers from curated data → confirm → saved against today's targets and the food streak, 3–5 times a day.
  - The gym program and set logging are part of the paid "rencana lengkap", not the funnel's loop.
- **First 30 seconds:**
  1. Meta ad → lander `/l/<slug>`, whose headline is the ad's hook word for word.
  2. Consent: terms, privacy and sensitive data (health data and the photo going to an AI provider in the USA), recorded before any processing (GAP-5).
  3. The 8-question quiz.
  4. **The first meal scan, before signup** (camera or gallery).
  5. The result.
- **The "aha"** (first real result, before the paywall), one screen:
  1. Each item with grams, kcal, protein, carbs and fat, each labelled with its source: "TKPI", "resep", "dari label kemasan" or "mirip: X" (editable).
  2. The plate against the quiz targets: "Piring ini = 31% kalori harianmu · protein 24 dari 140 g". Targets use Mifflin-St Jeor, labelled "perkiraan umum".
  3. "Langkah 1 hari ini": one rule-based sentence from goal + this plate + the quiz blocker, using curated templates and curated numbers. Example for cutting with low protein: "Di makan berikutnya, tambah lauk tinggi protein: 1 potong dada ayam (±25 g) atau 2 potong tempe (±14 g)."
  4. A preview of the full plan: Day 1 of the generated gym program ("Upper A · 6 gerakan"), with the first exercise visible and the rest blurred; a sample weekly progress chart; "Scan tiap kali makan (hingga 20× sehari)".
  5. CTA **"Buka rencana lengkap"** → sign up (magic link or Google) → paywall → paid. The anonymous scan moves to the account (`claimAnonymousData`).
- **Why they come back tomorrow:**
  1. The morning Beranda shows yesterday's gap and a new "Langkah 1 hari ini".
  2. Today's gym session is ready with a concrete target ("Lower A · squat naik ke 62,5 kg").
  3. The **food streak**: consecutive days with at least 1 meal logged. It's easy to keep, and losing it isn't punished.
  - Gym doesn't count toward the daily streak (rest days are normal). It has a weekly session target instead, and Beranda says "Hari ini rest day" on non-training days.
  - No push or email reminders in v1.
- **Quiz** (8 steps, `features/quiz.ts`, id `myna-fit-v1`):
  1. "Apa goal kamu sekarang?": Bulking · Cutting · Maintain.
  2. "Jenis kelamin": Pria · Wanita (for BMR).
  3. "Level pengalaman": Pemula · Menengah · Lanjutan.
  4. "Latihan berapa hari per minggu?": 2-3 · 4-5 · 6+.
  5. "Berat badan": number, 30–250 kg.
  6. "Tinggi badan": number, 120–220 cm.
  7. "Usia": number, 18–80.
  8. "Apa yang paling bikin susah?" (multi, max 2): Bingung makan apa · Nggak tahu protein cukup atau belum · Susah konsisten · Bingung program gym.
  - Province, city and gym name are not asked.
- **Free uses of the core action before the paywall:**
  - `funnel.coreAction: "meal_scan"`, `freeUses: 1`, `anonymousFreeUses: 1`, `anonymousPerIpPerDay: 20`, `paywallPlacement: after_first_result`. After signup the paywall comes straight away.
  - Cost caps: members 20 scans per day (fair use in S&K); a global anonymous budget of 1,000 scans per day. A scan costs about Rp20 (measured Rp12.5 standard / Rp23.4 Fast, 7 Oct 2026), so about Rp23 per non-paying visitor.
- **First ad hooks** ("Untuk [siapa] yang [masalah], dapatkan [hasil] dalam [waktu]"). Checked against CLAUDE.md "Ads and landers": no personal attributes, no body-change claims, true in the first session. `/ad-hooks` makes the full set of 10.
  1. "Untuk yang rutin ngegym tapi bingung makan apa, dapatkan kalori & protein piringmu dalam 15 detik dari satu foto."
  2. "Untuk yang ingin pola makan lebih teratur, dapatkan target kalori & protein harianmu dalam 2 menit."
  3. "Untuk pencinta nasi padang yang ingin tahu proteinnya, dapatkan angka dari Tabel Komposisi Pangan Indonesia dalam satu foto."

## Paid vs free
- **Free:**
  - The quiz, plus 1 meal scan in total, done before signup, with the full result screen (the "aha" above).
  - No trial (`trial.enabled: false`).
  - Signed-in users without a plan see their saved first scan and the paywall.
- **Paid** (6 or 12 months, paid once, no auto-renewal):
  - meal scans up to 20 per day, manual logging, history;
  - the full gym program with set logging, progressive targets, records, and the exercise photos and how-to;
  - Beranda with daily guidance, streak, weekly progress, body-weight trend.
  - The server enforces it (`requireAccess` / `requireAccessOrFreeUse`).

## Plans & prices
- 6 bulan: Rp249.000
- 12 bulan: Rp399.000 (highlighted, "Hemat Rp99.000" against two 6-month plans)

## Data the product stores
**Sensitive:** health data under UU PDP (specific personal data), so `legal.sensitiveDataConsent: true`, with explicit consent before any processing, including the anonymous scan and the quiz (GAP-5).

- **Account** (core): name, email, Google profile if used, consents, subscription and payments (Duitku), first-touch attribution, funnel events.
- **Quiz answers** (core `quiz_responses`): goal, gender, level, frequency, weight, height, age, blockers. *Health data.*
- **`fit_profiles`:** gender, birth year, height, weight, target weight. *Health data.*
- **`fit_goals`:** goal type, level, days per week, calorie and protein targets, active flag.
- **`meals` + `meal_items`:** eaten_at, thumbnail key, source; per item the food/recipe id or label, grams, a snapshot of kcal/protein/carbs/fat, the nutrition source and the data version. *Health data.*
- **Meal thumbnails:** 160 px JPEG in R2, one per meal (GAP-3). Deleted with the meal and the account.
  - The full photo (1024 px) is **not stored**. It goes to OpenAI (USA) for one analysis; OpenAI keeps API data up to 30 days for abuse monitoring and doesn't train on it.
- **`body_weights`:** one weigh-in per day. *Health data.*
- **`workouts` + `workout_sets`:** session name, time, completed; exercise, pattern, equipment, set number, kg / pin / seconds, reps, to-failure.
- **`user_programs`:** the program JSON and the current day.
- **`meal_scans`:** one row per AI attempt (user or anon id, model, ok, latency, tokens, cost estimate).
  - Anonymous rows are deleted after 90 days. Rows tied to an account are deleted with the account.
- **Device storage:** quiz progress, meal draft, program cache, sound setting.
- **Retention:**
  - while the account exists;
  - 24 months after a plan lapses, with an email first (product cron, GAP-6);
  - account deletion removes everything at once;
  - transactions are kept per tax law.
- Every product table goes in `exportProductData` / `deleteProductData`.

## Content & data sources
- **Nutrition values:**
  - **TKPI**, Tabel Komposisi Pangan Indonesia (Kementerian Kesehatan RI), taken from the official Kemenkes publication, not panganku.org.
    - Used with a citation shown in the app and on the site: "Sumber: Tabel Komposisi Pangan Indonesia, Kementerian Kesehatan RI".
    - Basis: UU 28/2014 Pasal 43 huruf b; Erdi decided on 2026-10-12.
    - Build step: check the copyright page of the PDF for a protection notice.
  - **Fallback:** USDA FoodData Central (CC0/public domain), credited as its source.
  - The dataset is versioned in the repo (`apps/api/src/features/nutrition/data`) with per-100 g values, aliases and portion sizes (centong, potong, butir, gelas). Changes go through PRs.
- **Recipes for mixed dishes:**
  - Written by the agent as ingredient lists in grams of TKPI items, including cooking oil, santan and sugar. A script computes the values and tests check them.
  - Reviewed by Erdi. A nutritionist review is an open question.
  - Starting set: the common dishes in Erdi's benchmark photos and the Lovable quick-add list.
- **Packaged food:** values read by the model from the label in the user's photo, shown as "dari label kemasan" and editable. Never from model memory.
- **The vision model** (OpenAI `gpt-6-luna`, default reasoning, Fast tier):
  - It only names foods, estimates grams and reads labels.
  - The model id and prices are re-checked against OpenAI's docs at build time.
  - Lovable's prompt rules carry over: Indonesian names, visible items only, sauces by look, drinks only when part of the meal, partly eaten plates.
- **Formulas:**
  - Mifflin-St Jeor BMR × activity (1.375 / 1.55 / 1.725) × goal (1.12 / 0.80 / 1.0).
  - Protein 1.8–2.2 g/kg.
  - Shown as general estimates.
- **Training logic:** the Lovable `fitness.ts`, `progression.ts` and `bodyweight.ts` rules (inventory §5), unit-tested.
- **Exercise photos:** free-exercise-db (The Unlicense), 63 exercises × 2 photos, `CREDITS.txt` kept.
- **Landing photos:** Pexels License, never captioned as members.
- **Notice on every screen and the site:** "Myna Fit memberi panduan umum gaya hidup sehat dan bukan pengganti tenaga profesional (dokter, ahli gizi, pelatih)."
  - No diagnosis, no medical claims, no shaming.
  - Body-weight guidance stays general ("perkiraan umum").
- **Design:** DESIGN.md tokens go into `product.config.ts`:
  - primary `#113BFE`, foreground navy `#032B84`, secondary `#DAE7FC`, background `#F7F5F3`, accent aqua `#24DDE2`, muted gray `#555C67`;
  - font Plus Jakarta Sans, radius 1.5rem;
  - the logo's own colours stay in the logo files.
  - The DESIGN.md rules (one filled button per screen, label table, four states, earned celebrations) carry over.
- **Copy:** casual "kamu" Bahasa Indonesia from Lovable, reviewed by Erdi.

## Out of scope for v1
- Gym form check from video. Planned for v1.1 as a paid feature. Interest is measured by a "Cek form (segera hadir)" button with a tap count; no ads for it until it exists.
- Share cards (canvas story/feed images): v1.1.
- The recovery map and body-map shading: v1.1. The exercise photos and how-to sheet stay.
- Push notifications and email reminders: native comes later.
- Email + password sign-in, password reset, WhatsApp number (core uses magic link + Google).
- Province, city and gym name; the `gym_chains` list; the gym logo ticker (third-party trademarks).
- The standalone `/plan` gym demo with free shuffles.
- Data migration from Supabase (the only user is Erdi, who gets access via `/admin` "Beri akses manual").
- Pakasir, Lovable AI, the Lovable OAuth broker.
- Native iOS/Android builds (the app code stays native-ready).

## Launch & distribution
- **Launch date:** after these steps, in order:
  1. the template gaps GAP-1 to GAP-8 are fixed in the factory and synced;
  2. v1 is built and accepted on preview;
  3. Erdi approves the cutover of `fit.mynahealth.id` from Lovable.
  - Payments stay in Duitku sandbox until PT Myna Bio Teknologi's KYC passes. The day-30 and day-60 clocks start when payments go live.
- **First channel(s):** Meta ads through the sell engine (Rp100K/day tests, one ad each, read at 3,000 impressions, `/ad-test-plan`), plus existing traffic to `fit.mynahealth.id`. SEO pages on Indonesian food protein come later.
- **Success metric at day 30:** ≥ 20 paying users with blended CAC ≤ Rp200.000. Target ROAS 1.75 on an average order of about Rp340.000.
- **Kill criteria at day 60:** fewer than 30 paying users, or blended CAC above Rp400.000 (2× target) after at least Rp3.000.000 of ad spend. Then stop the ads and rework the funnel or positioning with Erdi.

## Open questions
- **Domains** (decided at cutover):
  - Option A: the app on `fit.mynahealth.id` and the site/landers on another one-level host.
  - Option B: the site on `fit.mynahealth.id` and the app on `app-fit.mynahealth.id`.
  - Two-level hosts like `app.fit.mynahealth.id` need a paid Cloudflare certificate.
  - `domain` stays null (workers.dev) until then.
- A nutritionist review of the curated recipes and the "Langkah 1 hari ini" templates before ads run.
- A lawyer review of the privacy policy and terms (`legal.reviewed`). Carry over from Lovable: processors and cross-border transfer (Pasal 56), retention, refunds §4, PN Depok, 20 scans/day fair use.
- **Human steps:**
  - Google OAuth: new redirect URIs on the existing "Myna Fit" Google Cloud client.
  - Resend sending from mynahealth.id.
  - A Meta Pixel for Myna Fit.
  - `OPENAI_API_KEY` as a Wrangler secret (the dedicated OpenAI project with a budget cap).
  - After cutover: close the Pakasir project, Supabase and Lovable.
- The TKPI PDF copyright page (build step). If it carries a protection notice, switch to USDA FoodData Central plus our own recipes.
