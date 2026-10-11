# Status

Progress log, newest entry on top.

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
