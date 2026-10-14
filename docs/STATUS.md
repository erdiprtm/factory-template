# Status

Progress log, newest entry on top.

---

## 2026-10-15: One consent checkbox, inside the quiz (D-074), Myna Fit feedback round 5 item 1

- `legal.consentStyle: "single"` gives one checkbox with document links; one tick records every document at its version.
- `legal.consentPlacement: "quiz_first" | "quiz_last"` puts it under that question instead of a screen before the quiz.
- The server gate is unchanged. The legal team approved the single checkbox (Erdi, 2026-10-15).

---

## 2026-10-14: Secret steps that work from the Run button (D-072), Myna Fit feedback round 4 item 3

- SETUP_HUMAN 2a and every secret step: one `pbpaste | pnpm --filter @factory/api exec wrangler versions secret put …` command per block, `--env=""` for production. The same rule is in CLAUDE.md for agents.
## 2026-10-14: The site's local URLs come from the product's factory.json entry (D-073), Myna Fit feedback round 4 item 4

- No hostnames in template-owned site code, so syncs can't bring the template's workers.dev URLs back. `/new-product` writes the product's own registry entry into the new repo.
## 2026-10-14: Local E2E with 2 workers and 10 s expects (D-071), Myna Fit feedback round 4 item 2

- A busy laptop no longer fails random specs on 5 s timeouts. `PW_WORKERS` overrides the worker count. CI is unchanged.
## 2026-10-14: template-sync fails loudly instead of skipping a range (D-070), Myna Fit feedback round 4 item 1

- Paths the product already moved are left out and listed as "Apply by hand", and the rest applies.
- Nothing applied means exit 1 and `.template-version` unchanged. Conflicts or hand steps mean exit 2.

---

## 2026-10-14: One domain as a template pattern (D-069), Myna Fit feedback round 3 item 3

- SEO pages at `/artikel/<slug>/`; FAQ link `/harga/#faq`; production builds use `product.domain`.
- The landing at `domain.anonymousHome`; previews take no routes.
- `apps/site/test/one-domain.test.ts` lists missing or shadowing routes. SETUP_HUMAN section 12 has the human steps.

---

## 2026-10-14: One domain: the landing page at "/" for visitors without a session (D-068), Myna Fit feedback round 3 item 1

- `domain.anonymousHome` (e.g. `/mulai/`). A page load of `/` without a session cookie on the production domain gets a 302 there, keeping the query string, and so does the app's guard at `/`.
- Sign-out lands there. Everything else is unchanged, and so are products without the option. Native unchanged.
## 2026-10-14: Reply-To on every email (D-067), Myna Fit feedback round 3 item 2

- Customers' replies to sign-in, receipt and reminder emails go to `legal.contactEmail`, or to `MAIL_REPLY_TO` when set, not to a sending-only address.

---

## 2026-10-14: Shared CI secrets with one command (D-066)

- `pnpm setup-secrets` sets the names in `factory.secrets.json` (Cloudflare token and account id) on a repo from `~/.config/factory/.env.shared`, so new product repos need no token pasted. `--dry-run`, `--repo`, `--only`; values never printed.
- `/new-product` step 6 now runs it. `docs/SECRETS.md`: what is shared, what stays per repo, how to rotate.

---

## 2026-10-13: Bundled fonts swap in on web (D-065), Myna Fit feedback round 2 item 1

- On web, the first screen no longer waits for font files: it shows the fallback stack, then swaps.
- Local Lighthouse with 4 bundled weights: 63 → 85, the same as the system font. Native unchanged.
- Preloading made it worse (69), so it isn't used. Subsetting stays a product choice (licence per font).
## 2026-10-13: A fresh local D1 per E2E run (D-064), Myna Fit feedback round 2 item 2

- E2E uses its own `.wrangler/e2e`, emptied and migrated each run, so the anonymous per-IP cap and other counters never fill up across runs or from `pnpm dev`.
## 2026-10-13: API test timeouts 15 s (D-063), Myna Fit feedback round 2 item 3

- The first sign-in of an API test file no longer times out at 5 s when every package's tests run at once on a busy machine.

---

## 2026-10-13: Tree shaking for the web export (D-062), Myna Fit feedback item 2c

- Entry −5 KB gzip, and the lazy Sentry chunk is 1.15 MB → 0.62 MB.
- Gated by all E2E and the preview check of error reporting. Rollback: remove the two env vars from the app's `build` script.
## 2026-10-13: Dev sign-in from :8081 and template sync by version (D-061), Myna Fit feedback items 7 and 8

- `pnpm dev` sign-in works from the Expo dev server (development only).
- `/sync-template` applies the template's changes since `.template-version`, with no more `--allow-unrelated-histories` or manual base.
- **Myna Fit:** before its next sync, write `2f425e32baff993910d97b4fb817995de4d7b2e8` into `.template-version` and commit.

---

## 2026-10-13: Native storage that survives restarts (D-060), Myna Fit feedback item 6

- `core/kv`: AsyncStorage behind a cache loaded at start on native, and `localStorage` on web.
- Theme, language, quiz progress and the after-sign-in target now persist on native. Products can keep drafts with it.

---

## 2026-10-13: Smaller first web bundle (D-059), Myna Fit feedback item 2

- Sign-in, Akun, Admin, pricing and the billing return page load as one lazy chunk, and the web Checkbox no longer needs `react-native-svg`.
- Entry bundle: 418 → 366 KB gzip (−52 KB), 1,575 → 1,384 KB raw. better-auth is out of the first load, and a test guards the split.

---

## 2026-10-13: Render tests and slot follow-ups (D-058), Myna Fit feedback items 4 and 5

- App tests render React Native components (react-native-web in jsdom). The consent button is now proven by rendering, with a product slot filled.
- New slots: `quizSummaryBody`, `billingReturn` and `coreTabIcons`. Quiz numbers are formatted for the locale ("71,5 kg"), and Akun's segments stay on one line.

---

## 2026-10-13: Bundled fonts with several weights (D-057), Myna Fit feedback item 1

- One family can bundle several weights. Each weight is registered as `<family>_<weight>`, and `@factory/ui` picks the nearest file for each text.
- Checked in a real web build: headings load the heavy file and body text the regular one.
- Bundled fonts must be `.ttf`/`.otf`: Metro can't load woff.
## 2026-10-13: Free use spent only on success (D-056), Myna Fit feedback item 3

- `checkAccessOrFreeUse` plus `spendFreeUse(c)`: a failed result never costs the free use, and races can't double-spend.
- Myna Fit can replace its P-005 pre-check after the next `/sync-template`.
- Next from the feedback: bundled fonts with several weights, a render-test setup plus slot follow-ups, first-load size, native storage, the dev sign-in origin and the sync base.

---

## 2026-10-13: Template gaps from Myna Fit (D-055)

- `POST /api/consents` (and the pre-signup one) accept the missing documents when they complete what's recorded.
- The paywall copy mentions the trial only when there is one.
- Template API and E2E tests follow the product's config: trial, required consents, nav as links or tabs, the first lander.
- Lander hooks may be up to 160 characters.
- **Myna Fit can run `/sync-template` now.** It picks up product design layers 1–3 (D-052 to D-054) and these fixes.
  - The last template commit already in myna-fit is `0c665ce`, and the histories are unrelated, so the next sync needs `git merge template/main --allow-unrelated-histories`, with `0c665ce` as the manual 3-way base.
  - After the merge, run `pnpm theme`, which regenerates `global.css`, `tokens.css`, `product.generated.json` and the new `fonts.generated.ts`.
  - Then move Myna Fit's look into `brand.tokens`, `features/theme.ts` and `features/slots.tsx` (e.g. the chat-bubble quiz step, P-004).

---

## 2026-10-13: Product design, layer 3: display slots for core screens (D-054)

- `features/slots.tsx` restyles the quiz step (chat bubbles possible), the quiz summary, sign-in, consent and pricing headers, plan cards, the bottom tab items and the Akun header.
- Core keeps consent (one shared form; the accept button is disabled until all are checked), quiz validation, prices from config, no web prices on native, and access.
- Next: the Myna Fit template gaps (consent API, `paywall.body`, config-following tests, lander hook length).

---

## 2026-10-13: Product design, layer 2: component variants (D-053)

- Products restyle Button (per variant, size and label), Card, Badge, Input and Text from `apps/app/src/features/theme.ts`; the classes merge last with `cn()`.
- `cn()` now knows the token utilities, so overrides replace them.
- Next: layer 3 (slots for core screens) and the Myna Fit template gaps.

---

## 2026-10-13: Product design, layer 1: fuller design tokens (D-052)

- `brand.tokens` gained radii per element, control height, card shadow, density, heading and body weights, and bundled fonts (expo-font in the app, self-hosted on the site, no Google).
- Unset gives exactly today's look; a snapshot test pins the default classes.
- Next: layer 2 (product variants for components, `features/theme.ts`), then layer 3 (slots for core screens) and the Myna Fit template gaps.

---

## 2026-10-12: Follow-ups from creating myna-fit (D-050, D-051)

- **New products pass lint on their first `pnpm verify`.** `/new-product` wrote a long tagline on one line, which `biome ci` rejects. The generator now writes it the way Biome does and runs `biome format` on every file it rewrote. A test checks every spec.
- **AI caps per feature (D-050).** `requireAiBudgetFor("meal_scan", 20)` caps one feature next to the shared daily cap, so photo scans and cheap text parsing can have different limits.
- **Local E2E timeouts fixed (D-051).** Another server on :8787 made Playwright's start-up check time out. E2E now starts its own server on :8788, never reuses one, and stops at once if the port is taken.
- Myna Fit picks these up with `/sync-template`.

---

## 2026-10-12: Users' files in R2 (D-049)

- Template gap GAP-3 from the Myna Fit migration, the last one.
  - `FILES` R2 bucket per environment, with owners in the core `files` table.
  - `GET /api/files/:id` serves the owner only.
  - A visitor's files move to the account at signup, are deleted with the account, and are dropped after 90 days if unclaimed.
- The human enabled R2 on the Cloudflare account (`SETUP_HUMAN.md` step 2b). The agent created `factory-template-files`, `factory-template-files-preview`, `myna-fit-files` and `myna-fit-files-preview` (location apac).
- **All 8 template gaps from the Myna Fit migration are done.**

---

## 2026-10-12: Product navigation (D-048)

- Template gap GAP-8 from the Myna Fit migration. Products list their main screens in `apps/app/src/features/nav.ts`: bottom tabs on phones and native, the top bar on wide web.
- **Only GAP-3 (R2 storage for meal thumbnails) is left.** It needs R2 enabled on the Cloudflare account (human).

---

## 2026-10-12: Product scheduled jobs and product dependencies (D-046, D-047)

- Template gaps GAP-6 and GAP-7 from the Myna Fit migration.
- `apps/api/src/features/scheduled.ts` runs the product's own jobs after core's cron; a failure there never stops core's.
- Products may add the dependencies their features need (`CLAUDE.md`, `docs/TEMPLATE_SYNC.md`).

---

## 2026-10-12: AI provider adapter (D-045)

- Template gap GAP-1 from the Myna Fit migration. `@factory/core/ai` calls OpenAI (Responses API, strict JSON, not stored) or a mock, never throwing.
- Every call is logged in `ai_usage` with its cost. `requireAiBudget` caps calls per account or device and for all visitors per day, before a free use is spent.
- **Human (per product with AI):** OpenAI project with a budget limit, `OPENAI_API_KEY` secret (`SETUP_HUMAN.md` step 11).

---

## 2026-10-12: Upload routes get their own body limit (D-044)

- Template gap GAP-2 from the Myna Fit migration. Products list larger bodies per path in `apps/api/src/features/uploads.ts` (capped at 5 MB); everything else stays at 64 KB.
- `readImageUpload` reads a multipart image and checks its real type from the bytes.

---

## 2026-10-12: Consent before signup and a public entry screen (D-043)

- Template gaps GAP-4 and GAP-5 from the Myna Fit migration (`specs/myna-fit.migration.md`).
- Visitors accept the required documents on the device before the quiz and the first use. The API enforces it, and the consent moves to the account at sign-in.
- `funnel.anonymousEntry` names the product's public screen; the quiz leads there in the "pay for proof" flow.
- **Next template gaps for Myna Fit:** GAP-2 (upload body limit), GAP-1 (AI/vision adapter), GAP-3 (R2), GAP-6 (product cron hook), GAP-7 (product app dependencies), GAP-8 (product navigation).

---

## 2026-10-12: Anonymous free uses ("pay for proof", D-042)

- Visitors can get the first real result before signing up, enforced on the server per device and per IP per day.
- Those uses move to the account at signup, and the product hook `claimAnonymousData` moves the results.
- It's off by default (`funnel.anonymousFreeUses: 0`). Myna Fit will be the first product to turn it on.

---

## 2026-10-12: Sell engine acceptance passed ✅

- **The human ran the full flow on production**, with the template as the dummy:
  1. Lander `/l/contoh/` with UTM tags.
  2. Consent "iklan".
  3. Quiz, then sign-in.
  4. Example feature (the first result).
  5. Paywall.
  6. Duitku sandbox VA payment.
- **Meta Events Manager → Test events:** `Purchase`, received from **Server**, **Processed**, event id `pay_3f1b…` (the payment id, for Pixel dedup).
- **OpenPanel:** the ordered funnel, first result → paywall view → checkout start → purchase.
- **Checked by the agent on production:**
  - No Pixel loads before consent. After consent: PageView and ViewContent on the lander, and Lead when the quiz completes.
  - The site's choice and attribution carry into the app (no second banner).
  - The funnel beacon logs no console errors.
- **`/admin` CAC/ROAS for test spend** is covered by `apps/api/test/economics.test.ts`.
- **Fixes and follow-ups:**
  - The consent banner sits below the screens and no longer covers page content.
  - `/launch-check` gained items 14–18: sell engine, Meta Pixel/CAPI, no test code on production, Meta domain verification, ad guardrails.
  - **Human:** remove `META_TEST_EVENT_CODE` from production (`SETUP_HUMAN.md` step 10.5).

---

## 2026-10-12: Template test Pixel set (sell-engine acceptance)

- `marketing.metaPixelId` is the template's own test dataset. `/new-product` clears it.
- Production now shows the "iklan" consent banner, and the Pixel loads only after a yes.
- CAPI stays off until the human sets `META_CAPI_TOKEN` (and `META_TEST_EVENT_CODE` for the test).

---

## 2026-10-12: `sharp` 0.35.5 security override (D-041)

- The remaining audit items are dev/build tooling. Three patches become eligible on 2026-10-14, 16 and 18.

---

## 2026-10-12: Sell engine checked in production

- **Lander `/l/contoh/` (Lighthouse 13.5, mobile, simulated slow 4G):**

  | Measure | Result |
  |---|---|
  | LCP | 1.5 s (target < 2.5 s) |
  | CLS | 0 |
  | TBT | 30 ms |
  | Performance | 98 |
  | Accessibility | 100 |

  SEO scores 66 because landers are `noindex` on purpose.
- **Fixed:** the site → app funnel beacon got `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` (CORP same-origin on `/api/events`). That route is now `cross-origin`; all others stay `same-origin` (D-033).

---

## 2026-10-11: Sell engine, Module 8: guardrails (branch `feat/ad-guardrails`)

- `CLAUDE.md` gained an "Ads and landers" section covering Meta Advertising Standards, the health/fitness/food rules, promising only what the product does, lander scent, consent-only tracking and server-only money events (D-040).
- **All 8 sell-engine modules are on `main`.** The rest of the flow is live in production, and the Meta parts stay off until a Pixel ID is set.
- **Still pending (human):** the acceptance test with a Meta test Pixel: CAPI Purchase in Events Manager test mode, using the template's production as the dummy (`SETUP_HUMAN.md` step 10).

---

## 2026-10-11: Sell engine, Module 7: playbooks (branch `feat/sell-playbooks`)

- New skills: `/spec-interview`, `/ad-hooks` (not `/hooks`, which is built in), `/creative-brief`, `/ad-test-plan`, `/funnel-diagnose` and `/explain`.
- The spec template gained a "Core loop & funnel" section (D-039).

---

## 2026-10-11: Sell engine, Module 6: unit economics in /admin (branch `feat/unit-economics`)

- Ad spend can be entered by hand or imported from an Ads Manager CSV.
- Per product and per campaign: CAC, ROAS D7/D30, AOV, renewal rate, LTV and LTV − CAC.
- A funnel view flags the first step below its benchmark, and a target-CAC calculator is included.
- Admins can mark a payment refunded (D-038).

---

## 2026-10-11: Sell engine, Module 5: result before paywall (branch `feat/result-paywall`)

- A free quota of the core action is enforced by the API (`requireAccessOrFreeUse`).
- Paywall placement is configurable: after the quiz, after the first result (the default), or after the quota.
- The paywall frames plans per week, highlights the 12-month plan with its saving, and lists the payment methods (D-037).

---

## 2026-10-11: Sell engine, Module 4: quiz onboarding (branch `feat/quiz`)

- The quiz is defined per product in `features/quiz.ts`: 5–8 single, multi or number steps, with a progress bar and back navigation.
- Answers are saved on the device, then attached after sign-in (`quiz_responses`). The quiz ends on "Rencana kamu siap" (D-036).

---

## 2026-10-11: Sell engine, Module 3: landers (branch `feat/landers`)

- `/l/<slug>/` landers come from one Markdown file each. The headline is the ad's hook, word for word, and one CTA leads to the quiz, with price framing per week (D-035).
- The example lander is `/l/contoh/`.

---

## 2026-10-11: Sell engine, Module 2: Meta Pixel + Conversions API (branch `feat/meta-capi`)

- A consent banner with an "iklan/marketing" toggle (site and app). The choice is recorded in `consents` and can be withdrawn from Akun.
- With consent: the Pixel handles top-of-funnel events, and CAPI sends Purchase/Renewal from the webhook, deduplicated by the payment id (D-034).
- **Human:** when the first product runs ads, set up the Meta Business portfolio, ad account, Pixel ID, CAPI token and test code (`SETUP_HUMAN.md` step 10).

---

## 2026-10-11: Sell engine, Module 1: funnel events and attribution (branch `feat/funnel-events`)

- The standard funnel events (`lp_view` … `purchase`, `renewal`, `refund`) go to OpenPanel and to a first-party `funnel_events` table (D-033).
- First-touch attribution (UTM tags plus `fbclid`) is captured on the first visit, carried from the site to the app, attached at sign-in, and copied onto every payment.
- The webhook records `purchase` or `renewal`.
- **Next:** Module 2 (Meta Pixel plus Conversions API with consent), then landers, quiz, free quota with paywall placement, unit economics in `/admin`, playbooks and guardrails.

---

## 2026-10-11: Phase 8 accepted ✅ (dummy built, tested end to end, deleted)

- **Built** `erdiprtm/catatan-harian` from `specs/catatan-harian.md`:
  - `new-product --execute`, then the first `/sync-template`;
  - `/build-from-spec`: notes table, API, screen, and an E2E acceptance path.
- **First production deploy passed.** The new Worker got its auth secret from CI (`--secrets-file`, D-027).
- **The human tested on the dummy's production:** sign in, write a note, free 7-day limit, trial, paid search, Duitku sandbox purchase, receipt.
- **The human deleted** the repo, 4 Workers and 2 D1 databases. The agent verified they are gone and the template is untouched. `factory.json` is back to its example entry.
- **The run found and fixed 9 template gaps** (PRs #20, #22, #23, #24; D-027, D-028):
  - CI auth secrets and the config gate;
  - feature UI strings;
  - UU PDP export and delete hooks;
  - slug, price and DSN assumptions in tests;
  - Worker types regeneration;
  - feature-message typing;
  - generator tests in product repos.
- **The dummy's "rate limited" failures were a credential mix-up.** The Global API Key had been stored as `CLOUDFLARE_API_TOKEN`; Cloudflare answers it with code 10429, not an auth error. The human replaced it with a scoped API Token and rolled the Global API Key. `/new-product` now warns about this (D-029).

## 2026-10-11: Phase 4 acceptance complete; Phase 8 dummy in progress

- **Phase 4 ✅** on production (`DUITKU_MODE=sandbox`). The human paid twice through Duitku POP:
  - 6 months by Virtual Account, using the sandbox simulator;
  - 12 months by ShopeePay QRIS, using the simulator with the merchant order id `pay_…`.
- Both payments were confirmed through the signed webhook, access was granted, and both receipt emails arrived.
- Duitku sandbox secrets are set on preview and production (as undeployed versions, activated by the next CI deploy).
- **Phase 8 dummy** (`erdiprtm/catatan-harian`, public):
  - `new-product --execute` created the repo, both D1 databases, and the CI secrets. The push to `main` skipped the deploy cleanly.
  - The first `/sync-template` worked.
  - Building the notes feature (API, table, screen, E2E acceptance path) found 8 template gaps, fixed in template PRs #20, #22, #23 and #24 (D-027, D-028).
  - The dummy's first PR (#1) is blocked by a Cloudflare API rate limit (code 10429) on creating its preview Worker. It was retried 3 times and will be retried later.
- **Follow-ups:**
  - Retry with backoff around wrangler calls in CI (rate limits).
  - Move template paywall tests off `/example` and the home screen, so products can replace both.
  - Upgrade to Workers Paid before the first real launch or the 5th product: Workers Free allows 5 cron triggers per account and 10 ms CPU per request.

## 2026-10-11: Sentry wired (branch `feat/sentry`, on top of `fix/payments-unavailable`)

- The human created the Sentry org and project (US region, error monitoring only), and the DSN is in `product.config.ts` (D-025).
- Worker (`withSentry` + `onError`, `nodejs_compat`) and web app (lazy `@sentry/browser`), production and preview only, with PII off and scrubbed.
- OpenPanel verified live: site and app send to `api.openpanel.dev/track` → 200 (PR #15).

---

## 2026-10-11: OpenPanel analytics wired (branch `feat/openpanel`, on top of Phase 9)

- The human created the OpenPanel project (allowed domains: production site and app). Its client ID is in `product.config.ts` (D-024).
- Standard events from the site and the web app, production only, with PII scrubbed and opaque-id identify.
- `pnpm verify` green: 191 unit/integration tests plus 8 E2E. App bundle +1 KB.
- After it deploys: confirm events in the OpenPanel dashboard (launch-check item 9).

---

## 2026-10-11: Phase 1 acceptance complete: Expo Go on a real iPhone ✅

- The sign-in screen renders natively with the product tokens. Sending a magic link reached the local API over LAN (`EXPO_PUBLIC_API_URL`).
- The test found that native styling was broken (duplicate css-interop instance), fixed by Metro singletons (D-023, on `feat/phase-9-hardening`).
- Signing in on native needs `@better-auth/expo`, which is Phase 10 by design.
- **Next:** open the Phase 2 PR and merge the stack in order.

---

## 2026-10-11: Phase 9 hardening plus the DOKU adapter (branch `feat/phase-9-hardening`, stacked on Phase 8); not merged

- **Security headers** on the API (Hono `secureHeaders`), the app HTML (`_headers`) and the site (Astro hash CSP plus `_headers`). There are no inline scripts on the site. Checked in a real browser: zero CSP violations. E2E asserts the app's headers (D-021).
- **Rate limits** (Workers rate limiting binding): checkout 10/min per user, webhooks 120/min per IP. **Body limit** 64 KB. Zod on every remaining input.
- **`scripts/check-bundle-secrets.mjs`** runs in `pnpm verify`.
- **`pnpm audit`** triaged: none of the 11 advisories is in the Worker runtime. `fflate` was patched; 4 more patches become eligible 2026-10-12 to 2026-10-18 (follow-up, listed in D-021).
- **`DokuProvider`** (DOKU Checkout, non-SNAP HMAC). FAILED is not final. An unconfirmed "paid" webhook now gets a 503 so any provider retries (D-022). SETUP_HUMAN step 3b is for products that pick DOKU.
- `pnpm verify` green: 188 unit/integration tests (api 52, core 41, config 5, site 5, scripts 85) plus 8 E2E.

**Branch stack:** phases 2 → 3 → 4 → 5 → 6 → 7 → 8 → **9**. The same human blockers as below apply. The template's own `/launch-check` comes after the merges, since most items check `main` and production.

**Follow-ups:**
- Overrides for sharp, source-map-js, shell-quote and http-cache-semantics once they are 14 days old.
- Re-measure the app with Lighthouse on the preview.

---

## 2026-10-11: Phase 7 admin (branch `feat/phase-7-admin`) and Phase 8 factory tooling (branch `feat/phase-8-factory`) built; not merged

- `/admin` (allowlist, metrics, revenue per Jakarta month, recent payments, manual grant, webhook log), with tests that check the numbers against the DB, plus E2E (D-020).
- Spec checker, `new-product` script (dry run default) with tests, 6 playbooks, `docs/TEMPLATE_SYNC.md`, `docs/SPEC_TEMPLATE.md` plus `factory.json` (cherry-picked), and the dummy spec `specs/catatan-harian.md`.
- `pnpm verify` green: 157 unit/integration tests (api 43, core 24, config 5, site 4, scripts 81) plus 7 E2E (3 consecutive clean runs; one sign-out race in the admin E2E was found and fixed).

**Unmerged branch stack, in merge order:**
1. `feat/phase-2-db`
2. `feat/phase-3-auth`
3. `feat/phase-4-billing`
4. `feat/phase-5-app-shell`
5. `feat/phase-6-site`
6. `feat/phase-7-admin`
7. `feat/phase-8-factory`

(`docs/spec-template-and-registry` is now included in phase 8 and can be deleted.)

**Blocked on 🧑 HUMAN:**
- Expo Go test (phase 1 acceptance, then the phase 2 merge).
- Resend key plus approval to set `BETTER_AUTH_SECRET` (phase 3).
- Duitku sandbox (phase 4).
- `SITE_URL` variable approval (phase 6).
- OpenPanel and Sentry accounts (rest of phase 7).
- Deleting the phase 8 dummy.

---

## 2026-10-11: Phase 6 (launch kit / site) built on branch `feat/phase-6-site` (stacked on Phase 5); not merged

- `apps/site` (Astro 7, Tailwind 4, shared tokens): landing, pricing, FAQ, SEO page template, privacy, terms (UU PDP templates with the TEMPLATE banner), contact, 404, sitemap, robots, OG images, JSON-LD (D-019).
- Standard analytics events plus PII scrubbing in `@factory/core/analytics`; the site wires the events (no-op until Phase 7).
- CI/CD: site preview per PR plus a production deploy with its own smoke test and site-only rollback.
- Lighthouse locally: site 100 SEO on every page type; app performance 79–82 after removing lucide (4.2 MB → 2 MB bundle), accessibility 95.
- `pnpm verify` green: 144 unit/integration tests (api 40, core 22, config 5, site 4, scripts 73) plus 6 E2E.

**Before Phase 6 can merge:** repo variable `SITE_URL=https://factory-template-site.erdiprtm.workers.dev`, via `gh variable set` (the agent can do it with approval), plus a Lighthouse re-check on the preview.

---

## 2026-10-11: Phase 5 (app shell) built on branch `feat/phase-5-app-shell` (stacked on Phase 4); not merged

- NativeWind v4, `packages/ui` (Reusables-style), and a theme generated from `product.config.ts` with light/dark/system (D-018).
- i18n provider (`id` default, `en`), navigation bar, and every screen rebuilt mobile-first.
- Akun page: status, history, renew, language, theme, UU PDP data export, account deletion.
- `pnpm verify` green: 137 unit/integration tests (api 40, core 19, config 5, scripts 73) plus 6 Playwright E2E tests. These include the Phase 5 acceptance flow (trial → gated → simulated expiry → paywall → purchase → access restored) and the Akun flow (status, history, language persists, JSON download, delete).
- Visual check in a mobile viewport: light and dark themes render with the product tokens.

**Pending:** Lighthouse on the preview (after the merges), and the Expo Go native render (human).

---

## 2026-10-11: Phase 4 (billing) built on branch `feat/phase-4-billing` (stacked on Phase 3); not merged

- `PaymentProvider` interface, `DuitkuProvider` (POP, HMAC-SHA256 per the Apr 2026 docs), and `FakeProvider` (D-017).
- Checkout, webhook (idempotent, confirmed with the provider, receipt email), status polling, history, and trial endpoints. `requireAccess` middleware plus the example paid feature.
- Cron (production only): pending-payment expiry plus 7-day, 1-day, and on-expiry reminders, each sent once.
- App: pricing screen (no prices or links on native), paywall, billing return page that polls, example feature.
- `pnpm verify` green: 130 unit/integration tests (api 35, core 19, config 5, scripts 71) plus 4 Playwright E2E tests (sign-in ×2, trial unlock, purchase via the fake payment page).

**Before Phase 4 can merge (🧑 HUMAN):**
- Duitku sandbox account, with the merchant code and API key set via `wrangler secret put` (SETUP_HUMAN step 3).
- Enable the payment channels in the Duitku project.
- After the preview deploy: one VA payment (sandbox simulator) and one e-wallet/QRIS payment, then confirm access was granted (Phase 4 acceptance).

**Branch stack, in merge order:**
1. `feat/phase-2-db`
2. `feat/phase-3-auth`
3. `feat/phase-4-billing`

Plus the independent `docs/spec-template-and-registry`.

---

## 2026-10-11: Phase 3 (auth) built on branch `feat/phase-3-auth` (stacked on Phase 2); not merged

- Better Auth with magic link (plus Google when configured), auth tables in D1, D1-backed rate limits, versioned UU PDP consent gate, sign-in, consent and protected screens, sign-out (D-016).
- Email adapter `@factory/core/email`: Resend, plus capture for dev/test (D-004).
- `pnpm verify` green including E2E: 107 unit/integration tests (api 20, core 11, config 5, scripts 71) plus 2 Playwright tests.
- Live browser check on `wrangler dev`: sign-in → magic link → consent → home → sign-out.
- Smoke checks extended (`/sign-in`, signed-out `/api/me`), so a deploy without `BETTER_AUTH_SECRET` fails and rolls back.
- Also on branches: `docs/OPERATIONS.md` (on `feat/phase-2-db`); `docs/SPEC_TEMPLATE.md` + `factory.json` (on `docs/spec-template-and-registry`).

**Order of merging.**
1. Phase 1 Expo Go test (human).
2. `feat/phase-2-db` PR.
3. `feat/phase-3-auth` PR, rebased by merging main.
4. The spec-template docs (Phase 8 material) any time after that.

**Before Phase 3 can merge (🧑 HUMAN plus agent):**
- [ ] `BETTER_AUTH_SECRET` set on production and preview. The agent can generate and set it with `wrangler secret put`, which needs the human's approval prompt.
- [ ] Resend API key, set as the `RESEND_API_KEY` secret by the human (SETUP_HUMAN step 7).
- [ ] Google OAuth client with the two redirect URIs in SETUP_HUMAN step 4 (optional for merge; enables Google sign-in).
- [ ] Acceptance on the real preview: the human signs in with a magic link (and Google on production).

---

## 2026-10-11: Phase 2 (database) built on branch `feat/phase-2-db`; not merged yet

Phase 1 acceptance is complete except the human's Expo Go phone test. Per Operating rule 1, Phase 2 is prepared on a branch and its PR opens after that test.

- **Rollback drill passed** (PR #5 fixed the post-rollback check path; run 38111041768). The deploy went out, the smoke test failed on purpose, auto-rollback ran, the live version was verified as the target `93739ba3…`, and incident #6 was opened, then closed as a drill. The first drill (run 38110730393) had found the path bug; the rollback itself had worked.
- **`packages/db`:** Drizzle schema for the 5 core tables, the first migration `20261011041937_core_tables.sql`, a dev seed, and a README covering how products add tables. D1 databases were created (prod + preview) and bound in `wrangler.jsonc`.
- **`packages/core/entitlements`:** access check, trial-once, extend-never-overlap, idempotent payment grant, admin grant (D-015).
- **`pnpm verify` green:** 92 tests (api 10 incl. 8 on real local D1, core 6, config 5, scripts 71). Local migrate and seed work.
- **When merged:** CI migrates the preview D1 on the PR, and `deploy.yml` takes the first real Time Travel bookmark and migrates production. This is the first real exercise of the D1 steps.

---

## 2026-10-11: Phase 1 checkpoint done; first PR through the pipeline

- Public repo https://github.com/erdiprtm/factory-template created. `scripts/setup-github.sh` applied: squash-only, auto-merge, delete-branch-on-merge, `PRODUCTION_URL`, and the `main` ruleset (active; works on the free plan because the repo is public).
- Secrets `CLOUDFLARE_ACCOUNT_ID` (set by the agent) and `CLOUDFLARE_API_TOKEN` (pasted by the human via `gh secret set`; the agent never saw it). Token: the "Edit Cloudflare Workers" template plus D1:Edit.
- The bootstrap push to `main` ran `deploy.yml` before configuration existed. It failed at "Check configuration" and opened incident #1 as designed. Closed with an explanation.
- **PR #2 went fully hands-off.**
  - `verify` ✅.
  - `preview` ✅: CI bootstrapped the preview Worker, uploaded alias `pr-2`, smoke-tested it, and posted the sticky comment. https://pr-2-factory-template-preview.erdiprtm.workers.dev/api/health returns `env: preview`.
  - It auto-merged, then `deploy.yml` deployed production: version `6c443ae4…`, commit `dcdc88a`, smoke test ✅. https://factory-template.erdiprtm.workers.dev serves the app, and `/api/health` returns `env: production`.
  - A brand-new workers.dev hostname answered `error code: 1042` for its first seconds. The smoke test's retries absorbed this (attempt 3 passed).
- Validated against real Cloudflare output: `versions upload --var` plus alias URL parsing, `deployments status --json` (first deploy correctly reported "none"), a token with Workers Scripts Edit could create both Workers, and the ruleset plus auto-merge work on the free plan for a public repo.
- PR #3 adds a `rollback_drill` input to `deploy.yml` for the rollback proof.

## 2026-10-11: Phase 1 local scaffold green; waiting on 🧑 HUMAN checkpoint

**Done**
- **Monorepo:** pnpm 12.7.0 workspaces + Turborepo 2.11.4, strict TS 6.0.3, Biome 2.5.14. The 14-day version rule is enforced by pnpm (`minimumReleaseAge`), and versions are kept in the catalog (D-012, D-014).
- **`apps/api`:** Hono Worker with `GET /api/health` → `{status, env, commit, version}`. It serves `apps/app/dist` with SPA fallback (only `/api` and `/api/*` run the Worker), has dev-only localhost CORS, and gets its types from `wrangler types`. Tested with `@cloudflare/vitest-plugin` (2 tests).
- **`apps/app`:** Expo SDK 57 + Expo Router (`src/app`), React Query, Hono RPC client, minimal i18n (`id`/`en`). `app.config.ts` reads `product.config.ts`. The web export (`single`) builds.
- **`product.config.ts` + `packages/config`:** Zod-validated `defineProduct` (5 tests).
- **Script tests in Vitest:** migration gate (8) and guard hook (63).
- **`pnpm verify` green locally:** lint, migration check, typecheck, 78 tests, build.
- **Live local check:** `wrangler dev` plus the smoke test pass; deep link `/akun` → `index.html`; `/api/nope` → 404; the browser shows "Selamat datang / Server terhubung / Versi …".
- Also: `CLAUDE.md` written, workflows skip D1 steps until migrations exist (Phase 2), `.dev.vars.example` added.

**Waiting on the human (Phase 1 checkpoint)**
1. Repo name and visibility, then the agent runs `gh repo create` and `scripts/setup-github.sh`.
2. Create the Cloudflare API token and run `gh secret set CLOUDFLARE_API_TOKEN` (`SETUP_HUMAN.md` step 9).
3. Test in Expo Go on a phone (step 8). Do it soon: Expo Go drops SDK 57 when SDK 58 goes stable.

**Remaining Phase 1 acceptance after the checkpoint**
- [ ] Push, open the first PR. CI must pass `verify` + `preview`, and the PR comment must show a working preview URL with the health check.
- [ ] Merge → production deploy + smoke test (first deploy; there is no rollback target yet).
- [ ] Prove the rollback path once (deliberately failing smoke test).
- [ ] Confirm the GitHub plan allows the ruleset (D-007).

**Not done yet (Phase 1 optional):** the Claude Code Stop hook that runs `pnpm verify`. Skipped for now: verify takes ~30 s+, and a Stop hook on every turn end would slow normal conversation. Definition of done plus CI already enforce it. Revisit later.

---

## 2026-10-11: Phase 0 accepted ✅

- Node v24.21.0 (Homebrew `node@24`), pnpm 12.11.2 (standalone installer), git 2.50.1, gh 2.102.0, wrangler 4.149.0 (via npx; project-pinned in Phase 1).
- git identity: Erdi Pratama <erdiprtm@gmail.com>; `gh auth setup-git` done.
- `gh`: logged in as `erdiprtm`, scopes `gist, read:org, repo, workflow`. The token has no `user` scope, so the plan name can't be read via `gh api user`; Phase 1 finds out from the ruleset call.
- Cloudflare: account `f9b33b2c2aa81960b4d3144f45e4065e` (erdiprtm@gmail.com), workers.dev subdomain `erdiprtm.workers.dev`. Wrangler OAuth login works. The human did **not** connect Cloudflare's GitHub integration (Workers Builds), on purpose: deploys go only through GitHub Actions (D-005).
- Next: Phase 1.

---

## 2026-10-11: Blueprint v4 adopted; automated-delivery safeguards set up ahead of Phase 1

**State:** still waiting on 🧑 HUMAN for Phase 0 (`docs/SETUP_HUMAN.md` steps 0–2). Tooling re-checked: Node, pnpm, gh, and Homebrew are still missing.

**Blueprint v4 changes that affect the plan**
- Delivery is fully automated: agent PRs auto-merge on green, `main` auto-deploys to production with a smoke test and auto-rollback. There is no human approval step.
- The app frontend is now **Expo + React Native Web + Expo Router + NativeWind + React Native Reusables** (`apps/app`, replacing `apps/web`), so it is native-ready. A web-to-app funnel (Section 6b) adds the store sources `app_store`/`play_store` to the entitlement enum.
- Phase 1 now also needs proof that the app runs in Expo Go on a phone (added as `SETUP_HUMAN.md` step 8).
- Phase 5 Lighthouse performance target is ≥ 80 for the app (the site still needs ≥ 90/95). Phase 10 (native apps) only starts when the human asks.

**Done (user-requested, ahead of Phase 1)**
- `.claude/settings.json`: allow/ask/deny permissions plus a fail-closed PreToolUse hook `.claude/hooks/guard-destructive.sh`. The hook passes 64 test cases and was live-verified blocking `git -C . push --force` in this session. (D-006)
- `.github/workflows/pr.yml` (`verify` → `preview` on a separate preview Worker → smoke test → sticky PR comment) and `.github/workflows/deploy.yml` (verify → live version record → D1 bookmark → migrations → deploy → smoke → auto-rollback → incident issue). YAML syntax checked; actions pinned by SHA. (D-005, D-008, D-009, D-011)
- `scripts/smoke-test.mjs` + `scripts/smoke-checks.json` (tested against a mock server: pass, wrong commit, server down).
- `scripts/check-migrations.mjs` expand/contract gate (8 scenarios tested). (D-010)
- `scripts/setup-github.sh`: auto-merge, squash-only, `PRODUCTION_URL` variable, `main` ruleset. (D-007)
- `.gitignore`. `docs/SETUP_HUMAN.md` updated for v4.

**Must be validated in Phase 1 (cannot run before the monorepo and accounts exist)**
- [ ] Create `.nvmrc` (exact Node 24 version) and root `package.json` with a `packageManager` pin; the workflows depend on both.
- [ ] Wire `check-migrations` into `pnpm verify`; port its 8 scenarios and the hook cases into Vitest.
- [ ] `/api/health` returns `{ status: "ok", commit: env.COMMIT_SHA }`.
- [ ] Confirm `wrangler versions upload` accepts `--var` and prints the `pr-<n>` alias URL the workflow parses.
- [ ] Confirm the JSON shapes of `wrangler deployments status --json` and `wrangler d1 time-travel info --json` used by `deploy.yml`.
- [ ] Check the GitHub plan (`gh api user --jq .plan.name`) and run `scripts/setup-github.sh`. If the ruleset is refused: public repo or GitHub Pro (Student Pack).
- [ ] Prove a rollback once (deliberately failing smoke test on a throwaway change). This is required by launch-check item "rollback path verified".
- [ ] Write `CLAUDE.md` with the PR → auto-merge → deploy flow, the hard rules, and "use Write/Edit, not heredocs, for text that names blocked commands".

**Known consequences**
- Phase 8's "delete the dummy product and repo" is a human step: deletes are denied for the agent by design (D-006).
- A D1 restore is never automatic (D-009).

**Next**
- After "lanjut": re-check the Phase 0 acceptance items below, then start Phase 1.

---

## 2026-10-11 — Phase 0: Prerequisites and human setup

**State:** waiting on 🧑 HUMAN (`docs/SETUP_HUMAN.md` steps 0, 1, 2).

**Done**
- Tooling check on the dev machine (macOS 26.6.2, Apple Silicon):
  - present: git 2.50.1, Xcode Command Line Tools, bun 1.4.2 (not used by the template)
  - missing: Homebrew, Node.js, pnpm, GitHub CLI, Wrangler
  - leftover `gh` config shows a past login as `erdiprtm`. Validity is unknown until `gh` is installed.
  - global git `user.name` / `user.email` are not set
- Wrote `docs/SETUP_HUMAN.md` (Bahasa Indonesia), covering tool install plus the 7 account setups, checked against current official docs.
- Wrote `docs/DECISIONS.md` D-001 to D-004 (Node 24, Homebrew, project-local Wrangler, Resend for email).
- Copied `FACTORY_BLUEPRINT.md` into the repo root.

**Phase 0 acceptance (pending human)**
- [ ] `node --version` → v24.x
- [ ] `pnpm --version` → prints a version
- [ ] `gh auth status` → logged in, `workflow` scope present
- [ ] `npx wrangler whoami` → shows account
- [ ] `git config --global user.name` / `user.email` set

**Open questions for later phases**
- Phase 3: Workers preview URLs change per version, and Google OAuth needs exact redirect URIs. Plan: deploy previews with a stable preview alias (or Better Auth's OAuth proxy). Decide and document in Phase 1/3.

**Next**
- After the human says "lanjut": re-run the acceptance checks above, then start Phase 1 (monorepo, tooling, CI, `CLAUDE.md`).
