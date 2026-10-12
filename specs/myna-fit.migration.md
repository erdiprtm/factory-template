# Myna Fit: migration inventory (Lovable → factory)

Source: `~/myna-fit-companion` (github `erdiprtm/myna-fit-companion`, Lovable-connected, **read-only**: never push, never rewrite history). Stack there: TanStack Start + Supabase (Postgres, Auth, Edge Functions), hosted by Lovable at `fit.mynahealth.id`.
Target: product repo `myna-fit`, created with `/new-product specs/myna-fit.md myna-fit`, built later with `/build-from-spec` in `~/myna-fit`.

Each item goes to one of three places:

- **CORE**: already in the template; the product only configures it.
- **FEATURE**: product-owned code (`apps/*/src/features/**`, `packages/db/src/features/**`, `apps/site` content, `product.config.ts`).
- **DROP**: not carried over.

**GAP** means the template is missing something the product needs. Per `CLAUDE.md`, gaps are fixed **in the template first, in the factory chat**, then synced. They are never patched in the product's `core/` or `packages/`.

Already decided (2026-10-12, Erdi):
- **Payments:** Duitku only, sandbox until PT Myna Bio Teknologi's KYC passes. Pakasir is dropped. Prices: 6 bulan Rp249.000, 12 bulan Rp399.000.
- **Data:** no data migration. Start with an empty D1; Erdi signs up again and gets access through `/admin` "Beri akses manual".
- **Vision model:** it only recognises foods and estimates grams. Every number comes from curated data.
- **Funnel:** "Pay for proof", with `paywallPlacement: after_first_result` and anonymous free uses (D-042).
- **Cutover:** `fit.mynahealth.id` stays on Lovable until Erdi approves it.

---

## 1. Screens and flows

| Lovable route | What it does | Goes to | Notes |
|---|---|---|---|
| `/` landing | Hero, gym logo ticker, 3 steps, gym demo, progress demo, scan demo (1 free, no signup), pricing, FAQ, sticky CTA | **FEATURE (site)**: `apps/site` index + `/harga` + landers `/l/<slug>` | **Improve:** the scan demo becomes the funnel itself (lander → quiz → scan). **Drop** the gym logo ticker: third-party trademarks with no licence. Landing photos are under the Pexels licence; keep `CREDITS.txt`. |
| `/plan?step=` | Quiz (5 steps) → random program preview, 3 free shuffles per device | **CORE** quiz runner + **FEATURE** `features/quiz.ts`. The program preview moves into "Buka rencana lengkap" (paid). | The standalone `/plan` demo is **DROPPED**: one funnel, one aha (the scan). |
| `/checkout?step=` | Package → account (name, email, WhatsApp, password, consent) → Pakasir QRIS/VA with polling → done | **CORE** `/pricing` + billing (Duitku POP), `/sign-in`, `/consent` | Pakasir, the password and the WhatsApp field are **DROPPED**. Per-week price framing and the highlighted 12-month plan come from core (D-037). |
| `/auth`, `/forgot-password`, `/reset-password` | Email + password, Google via the Lovable broker | **CORE** magic link + Google (Better Auth) | **Change:** no passwords, so forgot/reset are **DROPPED**. Google reuses the existing "Myna Fit" Google Cloud client with new redirect URIs (human step). |
| `/kebijakan-privasi`, `/syarat-ketentuan` | Full UU PDP policy: AI provider in the USA, 24-month retention, 90-day anon logs, refund rules, PN Depok, 20 scans/day fair use | **FEATURE (site content)**: `apps/site/src/content/legal/*` + `legal.*` in config | Carry over the substance: processors and cross-border transfer (Pasal 56), retention, refund §4, dispute venue, fair use. Update the processors: Cloudflare, OpenAI, Duitku, Resend, OpenPanel, Sentry, Meta (only with consent). |
| `_authenticated` guard | Session + active membership → else `/checkout` | **CORE** `(app)` layout + `requireAccess` / `requireAccessOrFreeUse` | |
| `/onboarding` | Quiz (if needed) + weight/height/age → profile + goal with calorie/protein targets | **FEATURE**: number steps in the quiz, then a `fit_profile` row on signup | Target formulas move unchanged (§5). |
| `/dashboard` (Beranda) | Greeting, streak, calorie ring + protein, shortcuts (photo / training), week strip, today's meals, gym progress, body weight card with trend and guidance | **FEATURE** `features/home` | Core of "weekly progress". |
| `/nutrition` | Day navigation, summary, photo / gallery / manual logging, scan state machine, review sheet (edit, portion ×, quick add), save, edit, delete with undo, protein celebration | **FEATURE** `features/nutrition` | **Improve:** numbers from curated data (§4). Quick-add chips become curated items. |
| `/gym` | Program by split, day tabs, exercise cards, set logging (kg / pin / seconds, reps, to-failure), autosave, progression targets, rest timer, wake lock, PR detection, finish session, exercise picker, custom exercises, shuffle | **FEATURE** `features/gym` | Biggest port. Browser APIs need native equivalents (§8). |
| `/gym-progress` | Week muscle map, recovery, session history, per-exercise trend | **FEATURE** `features/gym` | |
| `/share` | Canvas share cards (story 9:16 / feed 4:5), own photo background | **DROP for v1** (Out of scope) | Canvas port: v1.1 with view-shot/skia. |
| `/profile` | Package end date, goal, gym, body data, targets, edit goal, sign out, delete account | **CORE** `/account` (subscription, export, delete, consents) + **FEATURE** profile section | Delete runs the `deleteProductData` hook. |
| 404 / error pages | | **CORE** | |

## 2. Database tables

All product tables go in `packages/db/src/features/**`. Each has a `user_id` FK to core `user.id` with ON DELETE CASCADE, and each is listed in `exportProductData` / `deleteProductData`.

| Supabase table | Goes to | Notes |
|---|---|---|
| `auth.users` | **CORE** `user` / `session` / `account` (Better Auth) | |
| `profiles` | **FEATURE** `fit_profiles` (gender, birth_year, height_cm, weight_kg, target_weight_kg) | `full_name` comes from core `user.name`. `city`, `gym_name` and `activity_level` are **DROPPED** (see question on gym/city). |
| `goals` | **FEATURE** `fit_goals` (goal_type, experience, days_per_week, calorie_target, protein_target, is_active) | History kept: one active row. |
| `workouts`, `workout_sets` | **FEATURE** `workouts`, `workout_sets` | Same columns. The cross-user check that RLS did is replaced by the API checking `workout.user_id`. |
| `meals` | **FEATURE** `meals` + `meal_items` | **Improve:** one meal row (eaten_at, photo key, source) with item rows (food_id or recipe_id or label, grams, kcal/protein/carbs/fat **snapshot**, `nutrition_source` = tkpi / usda / recipe / label / manual, `data_version`). This replaces the "rows with the same eaten_at" trick. |
| `body_weights` | **FEATURE** `body_weights` (unique user + day) | |
| `user_programs` | **FEATURE** `user_programs` (plan JSON, day_index, updated_at) | The server copy is the truth; the device keeps a cache. |
| `meal_scans` | **FEATURE** `meal_scans` (user_id or anon_id, model, ok, latency, tokens, cost in IDR) | Anonymous rows are claimed in `claimAnonymousData`. Usage accounting may move into core with the AI adapter (GAP-1). |
| `gym_chains` | **DROP** | Only used for the quiz's gym suggestions. |
| `payments`, `memberships`, `activate_payment()` | **CORE** `payments`, `entitlements`, billing webhook | Stacking months on renewal is core behaviour (check during build). |
| (new) curated nutrition | **FEATURE** data module, not a table | See §4. Versioned in git and reviewed in PRs. Meals store a snapshot, so a data fix never rewrites history. |

## 3. Edge functions

| Function | Goes to | Notes |
|---|---|---|
| `analyze-meal` | **FEATURE** `POST /api/scan` behind `requireAccessOrFreeUse` (no `requireSession`), using the core AI adapter (GAP-1) | Keep: forced tool call, status `ok / empty / not_food / unclear`, warm-up pings, a scan log for every attempt, prompt rules (Indonesian names, visible items only, sauces, drinks, partly eaten). **Change:** the model returns names + grams (+ label values for packaged food) only; the server matches curated data and computes all numbers (§4). |
| `delete-account` | **CORE** `/api/account` delete + `deleteProductData` | |
| `pakasir-create`, `pakasir-status`, `pakasir-webhook`, `_shared/pakasir.ts` | **DROP** (Duitku core) | |
| `_shared/client-ip.ts` | **CORE** `clientIp` (uses `CF-Connecting-IP`; on Workers it's set by Cloudflare) | |
| `_shared/meal-ai.ts` | **FEATURE** prompt + schema; the provider part moves to the **core** AI adapter (GAP-1) | |
| Daily caps: members 20 per 24 h, demo 2 per IP, 300 anonymous total per day | **CORE** quota (anonymous per device + per IP per day) + **FEATURE/GAP** per-user daily cap and global anonymous budget | See GAP-1. |

## 4. Meal scan with curated numbers (the improvement)

Layers, tried in order for each item the model returns:

1. **TKPI item.** Match the model's name to a curated food using aliases (e.g. "nasi putih", "nasi") and per-100 g values.
   - Source: TKPI, Kemenkes RI.
   - Licensing: Erdi decided (2026-10-12) to use it with a citation. UU 28/2014 Pasal 43 huruf b: reproducing a work made by or on behalf of the government is not an infringement unless a protection notice is attached.
   - **Build step:** check the copyright page of the official Kemenkes PDF. Take the data from the official publication, not from panganku.org (that site was hijacked in 2024). Cite in-app and on the site: "Sumber: Tabel Komposisi Pangan Indonesia, Kementerian Kesehatan RI".
   - Fallback when TKPI lacks an item: **USDA FoodData Central** (CC0 / public domain; attribution requested).
2. **Curated recipe** for mixed dishes (nasi goreng, soto ayam, gado-gado, rendang, …).
   - Each recipe lists its ingredients in grams from TKPI items, including cooking oil, santan and sugar. The per-100 g values are computed by a script and tested.
   - The model reports the dish and its total grams.
3. **Packaged food or drink.** The model reads the photographed nutrition label (per serving or per 100 g, serving size).
   - The item is shown as "dari label kemasan". If there's no readable label, it falls to layer 4.
4. **No match.** The nearest curated item is shown as "mirip: X". The user confirms, picks another item (search across curated data), or types manually.
   - Manual items are tagged `manual`, and their numbers are the user's own.

Rules:

- The model never supplies calories or macros for layers 1, 2 and 4. The server ignores any it sends.
- The curated dataset is versioned. Every saved item stores its source and data version.
- The quick-add chips (nasi putih, telur ceplok, tempe goreng, …) become curated items.

**Cost cap.** A scan costs about Rp12.5 (standard tier) to Rp23.4 (Fast tier), measured 7 Oct 2026, so about Rp20.

- Keep the per-account cap: 20 per day (stated in S&K as fair use).
- Add a global daily anonymous budget, like today's 300.
- The cap is checked before the model is called, for everyone.

## 5. Logic that moves unchanged (FEATURE, with unit tests)

- **Targets** (`fitness.ts:505-525`):
  - BMR (Mifflin-St Jeor): `10·kg + 6.25·cm − 5·age`, +5 for men, −161 for women.
  - Activity factor by training days: 1.375 for 2-3, 1.55 for 4-5, 1.725 for 6+.
  - Calories: TDEE × goal factor (bulking 1.12, cutting 0.80, maintain 1.0), rounded to the nearest 10.
  - Protein per kg: cutting 2.2, bulking 1.9, maintain 1.8.
  - These are general formulas, not advice. Show "perkiraan umum" plus the professional notice.
- **Program generation** (`fitness.ts`):
  - Exercise pool of 63; splits for 2-3, 4-5 and 6+ days; difficulty filter; rep schemes; shuffle.
  - Exercise photos: free-exercise-db (The Unlicense), 63 × 2 JPGs plus `CREDITS.txt`.
- **Progression** (`progression.ts`): double progression with increase, hold, deload ×0.9 and lighter rules. Step sizes: pin +1, +5 s, dumbbell +1/+2, machine +5, else +2.5.
- **Recovery** (`recovery.ts`): fatigue with a 36 h half-life, "recovering" at ≥3, "neglected" after 8+ days. **v1.1** (see Out of scope).
- **Body weight** (`bodyweight.ts`): 28-day least-squares weekly rate and the guidance thresholds.
  - Wording check: "kurangi ±200 kkal" is general guidance. Keep it non-prescriptive and never shaming.
- **Meal grouping labels** by hour (Sarapan / Makan siang / …): replaced by `meals` rows, labels kept.
- **PR detection:** best `weight_kg` from earlier workouts.
- **Rest timer:** 120 / 90 / 60 s by goal. Streak: days with a meal or a finished workout.

## 6. Secrets and config

| Lovable secret / var | Goes to |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **DROP** |
| `OPENAI_API_KEY` (dedicated "Myna Fit" OpenAI project with a budget cap) | **Keep** as a Wrangler secret, production + preview. The template has no slot for it yet (GAP-1). Preview, local, tests and E2E use a mock provider without a key. |
| `MEAL_AI_MODEL` (gpt-6-luna), `MEAL_AI_TIER` (fast) | Wrangler `vars` (not secret). Re-check the model id and prices against OpenAI's docs at build time. |
| `LOVABLE_API_KEY` | **DROP** (no Lovable AI fallback) |
| `PAKASIR_SLUG`, `PAKASIR_API_KEY`, `PAKASIR_WEBHOOK_SECRET`, `PAKASIR_MODE` | **DROP** |
| Google OAuth client ID/secret (Google Cloud "Myna Fit") | **CORE** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Human: add the new Workers redirect URIs (and later `fit.mynahealth.id/api/auth/callback/google`). |
| Duitku, Resend, OpenPanel, Sentry, Meta Pixel/CAPI | **CORE**. Per-product human steps in `SETUP_HUMAN.md`. Resend can send from mynahealth.id (already verified for myna-health; check). |

## 7. External services

| Service | Today | Goes to |
|---|---|---|
| Lovable hosting + editor | `fit.mynahealth.id` | Cloudflare Workers (`myna-fit`). The DNS cutover is a human-approved step (`~/myna-health/docs/DNS.md`: keep the `fit` A record and `_lovable.fit` until then). |
| Supabase (Postgres, Auth, Edge Functions) | Sydney/Singapore | D1 + Better Auth + Hono Worker → **DROP** Supabase after cutover. |
| OpenAI (vision) | Edge function | **Keep**, via the core AI adapter (GAP-1). |
| Lovable AI gateway, Lovable error reporting, Lovable OAuth broker | | **DROP** (Sentry and Better Auth replace them). |
| Pakasir | live | **DROP** (Duitku sandbox). Close the Pakasir project after cutover (human). |
| Google Fonts (Plus Jakarta Sans) | CDN | Bundled font (expo-font / site self-hosted), no Google call. |
| Fredoka | README only, not used (DESIGN.md: logo is a drawing) | **DROP** |

## 8. Browser-only APIs → native-ready equivalents (FEATURE, `*.web.tsx` where needed)

| Lovable | Target |
|---|---|
| `<input type=file capture>` + canvas resize (1024 px JPEG, 160 px thumbnail) | `expo-image-picker` + `expo-image-manipulator` |
| `navigator.wakeLock` | `expo-keep-awake` |
| `navigator.vibrate` | `expo-haptics` |
| Web Audio beeps | `expo-audio` sound file |
| `navigator.clipboard` | `expo-clipboard` (core billing handles VA display) |
| localStorage / sessionStorage (quiz, drafts, plan cache, flags) | Core storage pattern (`*.web.ts` + native) |
| Recharts | a React Native chart (`react-native-svg` based) |
| canvas confetti | small RN animation, or v1.1 |
| View Transitions, IntersectionObserver | Expo Router transitions; the site handles the sticky CTA |

Adding these packages to `apps/app/package.json` raises GAP-7.

## 9. Design → `product.config.ts`

From `DESIGN.md`. Tokens map to the template's color names:

| Token | Value |
|---|---|
| `primary` | `#113BFE` (electric blue, actions) |
| `primaryForeground` | `#FFFFFF` |
| `foreground` | `#032B84` (navy, headings) |
| `secondary` | `#DAE7FC` |
| `background` | `#F7F5F3` (beige) |
| `card` | `#FFFFFF` |
| `accent` | `#24DDE2` (aqua, highlights and records) |
| `accentForeground` | aqua-foreground from `styles.css` |
| `mutedForeground` | gray `#555C67` |
| `destructive` | red |

- **Note on renaming:** Lovable names electric blue `accent` and navy `primary`. The template's `primary` is "the one filled button", so electric blue becomes `primary`.
- **Font:** `fontFamily.sans` = "Plus Jakarta Sans". Radius: `1.5rem` (`rounded-3xl` cards).
- **Logo:** the blue `#1D3AF4` and lemon `#FFDE00` stay in the logo files (`public/brand/*`), not in the tokens.
- **Rules that carry over** into the build (copy them into the product's `specs/` or `features/README`): one filled button per screen, the label table, the four states, and earned celebrations.
- **Dark palette:** none exists today. Derive it at build time.

## 10. Template gaps (fix in the template first, in the factory chat)

| # | Gap | Why Myna Fit needs it | Suggested template change |
|---|---|---|---|
| **GAP-1** | **No AI/vision provider adapter** | The scan calls OpenAI with a key, logs usage and cost, and caps cost per user and for all anonymous visitors | `@factory/core/ai`: provider interface, OpenAI adapter (chat + image + forced tool call + JSON fallback), mock provider (no key: local, tests, E2E, preview), usage log with an IDR cost estimate, per-user daily cap and global anonymous daily budget helpers, `OPENAI_API_KEY` in `.dev.vars.example`, Bindings, CI secrets and `SETUP_HUMAN`. |
| **GAP-2** | **Global 64 KB body limit on `/api/*`** (`apps/api/src/index.ts:90`) | A 1024 px JPEG is about 150–300 KB, more as base64 | A per-route upload limit (e.g. 2 MB, image MIME check) that products can opt into, ideally multipart. |
| **GAP-3** | **No object storage** | Meal thumbnails (160 px, about 5–10 KB each). Lovable kept them as data URLs in the row. | Either an R2 binding + small storage helper (put/get/delete per user, included in UU PDP export/delete), or a documented decision that small thumbnails go in D1. See question. |
| **GAP-4** | **No public route for the first result** | `apps/app/src/app/quiz.tsx` sends every visitor without a session to `/sign-in`, and product screens live under the session-only `(app)` group. So the "scan before signup" flow has no screen. | `funnel.firstResultPath` (or a quiz `next`) used when `anonymousFreeUses > 0`, plus a product-owned public route slot (e.g. `src/app/(public)/`). Also write down that product route files under `src/app/` are thin re-exports. |
| **GAP-5** | **No consent before signup for sensitive data** | The anonymous scan sends a meal photo to OpenAI (USA), and the quiz asks weight, height and age. Both are health data under UU PDP and need explicit consent **before** processing. Core consents are recorded only after sign-in. | Record `sensitive_data` (+ terms/privacy) consent per `anonId` on the public flow, attach it at signup (like the touch and the quiz), and have the server refuse an anonymous scan without it. |
| **GAP-6** | **No product hook in the cron** | Retention promises: anonymous scan logs deleted after 90 days; data deleted 24 months after a plan lapses, with an email first | `runProductScheduled(env, now)` in `features/`, called from core `cron.ts`. |
| **GAP-7** | **Product app dependencies** | expo-image-picker, image-manipulator, haptics, keep-awake, audio, a chart library | Write down who owns `apps/app/package.json` additions (product deps allowed, Expo SDK versions, recorded in DECISIONS) and how `/sync-template` merges them. |
| **GAP-8** | **Product navigation** | Four bottom tabs (Beranda / Nutrisi / Gym / Profil). The core `TopBar` hardcodes Home / Account / Admin. | A product nav definition (e.g. `features/nav.ts`) that core layout renders, as top bar on web or bottom tabs on narrow screens and native. |
| GAP-9 (small) | Quiz step kinds are single / multi / number only | The Lovable quiz asked province, city and gym name (search + free text) | Only if we keep that question; I recommend dropping it (see question). |

Not gaps (handled by core or config): Duitku billing, manual grant in `/admin`, free-use quota per device + IP (D-042), `claimAnonymousData`, funnel events and attribution, Meta Pixel/CAPI behind consent, landers, legal pages with `sensitiveDataConsent`, account export/delete, renewal reminders.

## 11. Dropped on purpose

- Pakasir, Lovable AI, Lovable OAuth broker, Lovable error reporting.
- Passwords and the password strength meter, forgot/reset password, WhatsApp number.
- Gym logo ticker (trademarks), `gym_chains`, regions data (if the gym/city question goes).
- The `/plan` standalone demo and per-device shuffle counter (the funnel has one aha: the scan).
- Share studio (v1.1), Fredoka.
- Data migration (only user is Erdi).

## 12. Decisions from the interview (2026-10-12, Erdi)

Full detail is in `specs/myna-fit.md`.

1. **Core loop:** the meal scan. The gym program and set logging belong to "rencana lengkap".
   - Video form check was researched and moved to v1.1: it can't give a result straight after an ad, it's used weekly not daily, accuracy depends on camera angle, and it costs far more per use.
2. **Quiz:** 8 steps (goal, gender, level, frequency, weight, height, age 18+, blockers). Gym and city are dropped, so GAP-9 isn't needed.
3. **Free scans:** 1 anonymous and 1 in total, so the paywall comes right after signup. Members get 20 per day; the anonymous budget is 1,000 per day.
4. **Aha:** a result with sources, the plate against daily targets, "Langkah 1 hari ini", a partly blurred Day 1 of the gym program, and "Buka rencana lengkap".
5. **Coming back:**
   - the morning Beranda with yesterday's gap and a new "Langkah 1 hari ini";
   - today's gym session with its target;
   - a **food streak** (≥1 meal logged per day). Gym has a weekly session target instead, because rest days are normal.
   - No push or email in v1.
6. **Kill criteria:** day 30 success is ≥20 paying users at CAC ≤ Rp200rb. Day 60 kill is <30 paying users, or CAC > Rp400rb after ≥ Rp3 juta of ad spend. Clocks start when payments go live.
7. **Thumbnails:** R2 (GAP-3 stays).
8. **Trial:** off.
9. **TKPI:** used with a citation (Pasal 43 huruf b); USDA FoodData Central as the fallback.
