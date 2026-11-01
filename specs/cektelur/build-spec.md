# cektelur — Product & Build Spec

> Brief for Claude Code. Build the MVP described here. Where this spec is silent, follow the conventions of the existing ASF boilerplate. Ask before adding any paid API or third-party service not listed below.

---

## 0. START HERE: build now, before farmer data arrives

Pilot farmer data (videos, weighed eggs, grade thresholds, tray size) will arrive in **1–3 days**. Do NOT wait for it. Build everything that does not depend on real data, using placeholders behind clean interfaces, so real data can be plugged in without refactoring.

### Build now
1. **Project setup:** repo on ASF conventions, Cloudflare Pages + Workers, D1 schema + migrations (§9), R2 bucket for model files and data-collection uploads, Sentry/PostHog wiring.
2. **Auth** (§5) and farm onboarding screens (§8.1–8.2).
3. **Camera + inference pipeline, model-agnostic** (§6):
   - Define a `Detector` interface: `detect(frame) → [{bbox, class, score}]`.
   - Implement `MockDetector` that emits a realistic 5×6 tray grid of egg boxes with random sizes, jitter, occasional `egg_cracked`, and occasional dropouts (simulating hands). Use it to build and test everything downstream.
   - Implement `OnnxDetector` (ONNX Runtime Web, WebGPU → WASM fallback, in a Web Worker) that loads a model URL from config/R2. It must work with any YOLOX ONNX export once available.
   - Optional bootstrap: if a **permissively licensed** public egg dataset exists (verify license, no AGPL/NC), train a rough bootstrap model so the real camera can be tested. Otherwise skip; MockDetector is enough.
4. **Tracker, tray grid mapping, temporal voting, blur check, overlay, counters, alerts** (§6) — all testable with MockDetector.
5. **Size → weight → grade module** (§7) as pure functions with **unit tests on synthetic data**: px→mm via tray pitch, ellipsoid weight model, per-farm least-squares fit of `k`, threshold grading, borderline flag.
6. **Calibration flow UI** (§7.6) wired to the fit function.
7. **Production log, price input, history, WhatsApp share** (§8.4–8.6).
8. **Trial "3 hari panen", subscriptions, DOKU checkout + webhook in sandbox mode** (§3).
9. **PWA:** Service Worker caching, IndexedDB offline queue + idempotent sync (§9 notes).
10. **Data collection mode** (hidden route, e.g. `/kumpul-data`), so the pilot farmer can send training data through the app instead of WhatsApp:
    - Record short videos of a tray (rear camera, guide overlay) → upload to R2 with farm ID + timestamp + device model.
    - "Timbang tray" form: 5×6 grid; farmer taps each position and enters grams + his own grade (kecil/sedang/besar/retak) → saved to D1 linked to the video just recorded.
    - Form for grade thresholds (grams) and tray cell pitch (mm).
    - Shows clear consent text that data is used only to train cektelur models.
11. **ML scaffolding in `/ml`** (§10), ready to run when data lands:
    - Frame extraction + dedupe script from videos in R2.
    - Dataset folder structure + label format for `egg`, `egg_cracked`.
    - YOLOX-Nano/Tiny training config, ONNX export + FP16/INT8 quantization script.
    - Evaluation script: count accuracy per tray, crack precision/recall, and **grade agreement vs the weighed ground-truth** (input: the data-collection export).

### Placeholders (must be in config, clearly marked `TODO(pilot)`)
- `small_max_g`, `medium_max_g` — grade thresholds. Use obviously-temporary defaults and show a "belum dikalibrasi" banner.
- `tray_cell_pitch_mm` — tray scale reference.
- Global default weight coefficient `k`.
- Reference low-end device + FPS target.

### Blocked until pilot data arrives
- Training the real detector, real accuracy numbers, final thresholds and `k`, pilot install.

---

## 1. What we're building

**cektelur** is a mobile web app (PWA) for Indonesian small–medium egg farmers (peternak ayam petelur). The farmer opens the camera, points it at a tray of eggs, and the app **grades every egg by size (kecil / sedang / besar) and flags cracked eggs in real time**, so the farmer can pick eggs out by hand immediately. Each scan is **automatically recorded into a daily production log** (count + estimated kg per grade), which the farmer confirms after final sorting. The farmer enters local egg prices to see the estimated value of the day's production.

**Positioning:** "Scan otomatis, langsung tercatat." Do not market it as "AI" to farmers.

**Core loop:** open camera → real-time grading overlay → farmer sorts by hand → save to log (Draft) → farmer cleans/sorts → confirms final count & kg (Final) → enters price → sees estimated value.

---

## 2. Users & context

- **Primary user:** independent (mandiri) layer farmer, UMKM scale. Harvests **every day**. Grades eggs into **kecil, sedang, besar**; small eggs sell cheaper; only eggs meeting size criteria get packed for sale. Current practice: wipe eggs clean, check for cracked shells, grade by size (larger operations use scales/weight).
- **Device:** mostly **Android phones, often low-to-mid range (Rp1–2 jt)**. Target Chrome on Android first. iOS Safari is best-effort.
- **Environment:** farm/barn lighting, patchy connectivity → must work **offline after first load**.
- **Hands-free use:** phone is ideally on a cheap stand pointing down at the tray while hands pick eggs.
- **Language:** all UI copy in **Bahasa Indonesia**, simple, non-technical.

---

## 3. Final product decisions

### Pricing (sold in 3-month and 12-month packages only, no monthly)

| Plan | 3 months | 12 months |
|---|---|---|
| **Peternak** | Rp169.000 | Rp708.000 **+ bonus 2 months** (14 months total) |
| **Pro** | Rp279.000 | Rp1.188.000 **+ bonus 2 months** (14 months total) |

- **Trial:** "3 hari panen" — trial is consumed per **day on which at least one scan is saved**, not calendar days. After 3 harvest days, saving to the log requires a paid plan. Scanning view itself can stay usable for demo, but saving/history is locked.
- **Bonus 2 months applies only to 12-month plans.**
- **Founder price (configurable, off by default):** 12-month Peternak at Rp390.000 for the first 50 customers.
- **Refund policy:** 7-day money-back (display in checkout copy).
- Prices, bonus months, trial length, founder price must all live in **config**, not hardcoded in UI.

### Plan features
- **Peternak:** unlimited scan, full production history, estimated kg & value, price input, WhatsApp report share.
- **Pro:** Peternak + multi-user (farm workers), multi-farm (multi-kandang), *(phase 2)* regional price comparison, receivables (piutang).

### Payments
- Payment gateway: **DOKU** (merchant entity: PT Musim Panen Harmonis / MPH). Methods: QRIS, e-wallet, VA.
- Payment webhook handled by a **Cloudflare Worker** → verify signature → update subscription in DB.

---

## 4. MVP scope

### In scope
1. **Onboarding & calibration**
2. **Real-time scan** (size grading + crack flag + counter)
3. **Production log** with Draft → Final flow and farmer edits
4. **Price input per grade** → estimated daily value
5. **History** (daily list, weekly/monthly totals) + **share report to WhatsApp**
6. **Auth, trial, subscription & DOKU payment**
7. **PWA install + offline**

### Explicitly out of scope (do not build)
- Any LLM / paid AI API calls (OpenAI, Gemini, Claude, etc.). All inference is on-device.
- Freshness/inside-egg detection, candling mode.
- Dirt/stain detection (farmers wipe eggs anyway; maybe later).
- Regional price comparison, receivables, feed cost/profit, flock productivity → **phase 2**.
- Data marketplace, credit scoring → **phase 3+**.
- Native apps. (Later: wrap PWA as Trusted Web Activity for Play Store.)

---

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Follow ASF boilerplate; if none applies: **React + Vite + TypeScript**, PWA | Mobile-first, large touch targets |
| Hosting | **Cloudflare Pages + Workers** | Already on paid Cloudflare plan |
| Static/model files | **Cloudflare R2** + CDN | Model file served from R2, cached by Service Worker |
| Database | **Cloudflare D1** (SQLite) | All data access goes through a Workers API; no direct client DB access |
| Auth | Use ASF's existing auth if it runs on Workers; otherwise **Better Auth (or equivalent) on Workers + D1**, sessions in D1 | Login via email OTP/magic link for MVP. WhatsApp/SMS OTP needs a paid provider: ask before adding |
| API | **Cloudflare Workers** (e.g. Hono) | Enforces authorization: every query scoped to the user's farm(s) |
| On-device inference | **ONNX Runtime Web** | WebGPU backend, **WASM fallback**; run in a **Web Worker** |
| Detection model | **YOLOX-Nano / YOLOX-Tiny (Apache-2.0)** | **Do NOT use Ultralytics YOLO (AGPL-3.0)** |
| Camera | `getUserMedia` (rear camera), `requestVideoFrameCallback` | HTTPS required |
| Overlay | Canvas 2D on top of `<video>` | |
| Alerts | Vibration API (Android) + Web Audio beep | Vibration not available on iOS — degrade silently |
| Share | Web Share API (image + text) → WhatsApp | Fallback: download image + copy text |
| Offline | Service Worker (cache app shell + model); IndexedDB queue for unsynced logs | |
| Payments | DOKU + Cloudflare Worker webhook | |
| Monitoring | Sentry (errors), PostHog (usage) — free tiers | |
| Training (separate, Python) | YOLOX training repo, labeling in Roboflow or CVAT, export ONNX, quantize FP16/INT8 | Lives in `/ml`, not shipped to client |

---

## 6. Real-time scan pipeline

```
camera frame (e.g. 1280x720)
  → Web Worker: letterbox resize to 320–416px
  → ONNX model: detect {egg, egg_cracked}
  → NMS
  → tracker (IoU-based) assigns stable IDs
  → tray grid mapping (row × column) for stable labels like "B3-K5"
  → per-egg size measurement (see §7) → grade
  → temporal voting over last N frames
  → overlay render + counters + alerts
```

Requirements:
- **Model classes:** `egg`, `egg_cracked` (size is NOT a model class — computed geometrically).
- **Temporal voting:** an egg is flagged cracked only if detected cracked in ≥5 of the last 10 frames (configurable). Size = median of measurements over its tracked frames.
- **Stable marks:** when a hand occludes eggs, keep last known label for that grid cell for a short timeout so red marks don't jump to other eggs. Include hands/fingers as background in training data.
- **Blur handling:** skip frames with high motion blur (simple Laplacian-variance check); show "Pelan-pelan" hint.
- **Overlay colors:** kecil / sedang / besar each a distinct color + text label (don't rely on color alone); cracked = red outline + "RETAK".
- **Counter bar:** total, per grade, cracked. Updates as eggs are removed.
- **Alert:** vibrate + beep when a new cracked egg is confirmed.
- **Performance target:** ≥8 FPS end-to-end on the reference low-end Android device (define in config/README after testing). Degrade gracefully (lower input size, skip frames) rather than freeze UI.
- **Hi-res recheck (nice-to-have):** for an egg with borderline crack confidence, grab one full-res frame and run a crop-level recheck.
- **"Simpan ke catatan"** button saves the current tray result to today's Draft log (adds to running daily totals). Prevent accidental double-save of the same tray (confirm dialog if saved <10s ago with near-identical counts).

---

## 7. Size → weight → grade

Grading in the market is by **weight**, the camera measures **dimensions**. Bridge with per-farm calibration.

1. **Pixel → mm:** use the tray as scale reference. Estimate tray cell pitch in pixels from the detected egg grid; convert using configurable `tray_cell_pitch_mm` (measure on real trays used by pilot farmer; default TBD). Also correct for mild perspective using the grid.
2. **Dimensions:** fit ellipse / use bbox → major axis L, minor axis W (mm).
3. **Weight estimate:** ellipsoid-volume model `weight_g = k × L × W²` (+ optional intercept). Fit `k` per farm by least squares from calibration samples. Provide a sensible global default `k` until calibration exists.
4. **Grade:** compare estimated grams against farm thresholds `{small_max_g, medium_max_g}` (configurable per farm, set during onboarding; defaults TBD with pilot farmer).
5. **Borderline:** if estimate is within ±X g of a threshold (configurable), mark as "batas" (e.g. dashed outline) so farmer can double-check.
6. **Calibration flow:** farmer weighs 20–50 eggs on a kitchen scale, scanning each/tray position and entering grams. Store samples, refit `k`, show fit quality (e.g. mean abs error in grams).

---

## 8. Screens (all copy in Bahasa Indonesia)

1. **Welcome / login** — email OTP / magic link (Workers auth). Simple.
2. **Onboarding**
   - Nama kandang, kabupaten/kota, (optional) jumlah ayam.
   - Batas grade (gram) kecil/sedang/besar.
   - Kalibrasi (can skip, with warning that estimates are less accurate).
   - Tip: use a phone stand, camera above tray, even light, no direct flash.
3. **Scan (home)** — full-screen camera, guide overlay for tray framing, live grading overlay, counter bar, "Simpan ke catatan" button, trial/plan badge.
4. **Catatan hari ini**
   - Status **Draft** (from scans) → editable fields per grade: jumlah butir, kg; jumlah retak.
   - Optional "timbang per peti" entry for accurate final kg.
   - Button **"Konfirmasi final"** → status Final (still editable with audit trail).
   - Shows Draft vs Final difference (store both; used later to improve the model).
5. **Harga** — price per grade (Rp/kg) for today, pre-filled with last entered values; one tap "Sama dengan kemarin". Show estimated value of today's production = Σ(final kg × price) per grade. Label clearly as **estimasi nilai produksi**, not sales.
6. **Riwayat** — list by day (date, total butir, kg per grade, estimated value, status), weekly & monthly totals, simple chart. **Bagikan ke WhatsApp** generates an image summary + text.
7. **Langganan** — trial status ("2 dari 3 hari panen tersisa"), plans, DOKU checkout, active period end date.
8. **Pengaturan** — farm profile, grade thresholds, recalibrate, `tray_cell_pitch_mm`, logout. Opt-in toggle: "Bantu tingkatkan akurasi" (upload low-confidence frames).

Pro-only (MVP can stub behind plan check): invite worker to farm, switch between farms.

---

## 9. Data model (Cloudflare D1 / SQLite)

D1 has no row-level security: **every Worker endpoint must check that the session user is a member of the farm** before reading or writing. Use migrations (`wrangler d1 migrations`). Store timestamps as ISO strings or unix ms, money as integer Rupiah, grams as integer or REAL.

```
users                id, email, created_at      -- plus auth sessions tables per auth library
farms                id, owner_id, name, kabupaten, flock_size?, small_max_g, medium_max_g,
                     tray_cell_pitch_mm, weight_k, weight_intercept?, created_at
farm_members         farm_id, user_id, role (owner|worker)            -- Pro
calibration_samples  id, farm_id, length_mm, width_mm, weight_g, created_at
scan_saves           id, farm_id, user_id, date, saved_at,
                     n_small, n_medium, n_large, n_cracked,
                     est_kg_small, est_kg_medium, est_kg_large, model_version
daily_logs           farm_id, date (PK pair), status (draft|final),
                     draft_* (aggregated from scan_saves),
                     final_n_small, final_n_medium, final_n_large, final_n_cracked,
                     final_kg_small, final_kg_medium, final_kg_large,
                     confirmed_at, notes
daily_log_edits      id, farm_id, date, user_id, field, old_value, new_value, edited_at
daily_prices         farm_id, date, grade (small|medium|large), price_per_kg
subscriptions        id, farm_id, plan (peternak|pro), period_months (3|12), bonus_months,
                     starts_at, ends_at, status, doku_reference, amount, is_founder_price
trial_usage          farm_id, harvest_days_used, last_counted_date
feedback_frames      id, farm_id, r2_key, reason (low_conf|borderline|user_flag), created_at  -- opt-in only
```

Notes:
- `daily_logs.draft_*` = sum of that day's `scan_saves`.
- Trial: on first `scan_save` of a new date, increment `harvest_days_used` if no active subscription.
- Subscription active = `now() between starts_at and ends_at` with status `paid`. `ends_at = starts_at + period_months + bonus_months`.
- Offline: write `scan_saves` and edits to IndexedDB first, sync when online, idempotent by client-generated UUID.
- Prices and production data are sensitive to farmers: never expose one farm's data to another. Any future aggregate must be anonymized (UU PDP compliance, explicit consent).

---

## 10. ML workstream (`/ml`)

1. **Data:** short videos of trays from pilot farm (normal farm lighting, include hands, include cracked eggs). Extract frames (dedupe near-identical). Target 500–1,000 labeled frames for v1.
2. **Labels:** `egg`, `egg_cracked`. Bounding boxes tight to the shell.
3. **Ground truth for weight:** 2–3 trays where each position's egg is weighed (grams) and the farmer's grade recorded → used to validate §7, not for detector training.
4. **Train:** YOLOX-Nano/Tiny, input 320–416. Augment for lighting, blur, rotation, tray color.
5. **Export:** ONNX → quantize → measure size (target: a few MB) and latency in browser on reference phone.
6. **Version:** `model_version` string stored with every scan save. Model file in R2 with versioned path; client caches and updates via Service Worker.
7. **Active learning (opt-in):** low-confidence and borderline frames uploaded to R2 for relabeling.

---

## 11. Milestones

| Week | Deliverable |
|---|---|
| 1 | Repo setup on ASF, Cloudflare Pages/Workers + D1 + R2 wired, camera + overlay skeleton running a placeholder/public egg model; data collection guide sent to pilot farmer |
| 1–2 | First trained `egg`/`egg_cracked` ONNX model; size→weight→grade logic with calibration |
| 2 | Production log (Draft/Final), price input, history, WhatsApp share |
| 2–3 | Auth, trial "3 hari panen", DOKU checkout + webhook, PWA offline |
| 3 | Pilot build installed on pilot farmer's Android phone |
| 3–6 | Pilot: measure accuracy, speed, daily usage, willingness to pay; iterate |

---

## 12. Acceptance criteria (MVP)

- Camera opens on Chrome Android, overlay renders live; works offline after first load.
- ≥8 FPS on reference low-end Android device; UI never freezes.
- **Egg count per tray:** ≥98% correct on pilot test set.
- **Grade agreement vs scale:** target ≥90% after calibration (validate in pilot; report actual).
- **Crack detection:** report precision/recall on pilot test set; no target yet.
- Scan → "Simpan" → appears in today's Draft log; Draft → edit → Final works with edit history.
- Price input → estimated value computed correctly per grade.
- Trial consumes per harvest day; paywall blocks saving after 3 days; DOKU payment activates plan with correct end date incl. bonus months.
- WhatsApp share produces a readable summary image + text.
- No calls to any paid AI API anywhere in the codebase.

---

## 13. Open questions (resolve with pilot farmer)

- Exact gram thresholds for kecil / sedang / besar (and whether buyers differ).
- Standard tray type and cell pitch (mm) used.
- Do they sell per kg, per peti, or per ikat? (affects price input unit)
- Daily volume and how many people sort.
- Time spent sorting today vs with cektelur.
- Willingness to pay: 3-month vs 12-month, at what price.
