# Decisions

Short records of non-trivial choices. Newest at the bottom. Format: context, decision, alternatives considered.

---

## D-001 — Node.js 24 LTS for local tooling (2026-10-11)

**Context.** The blueprint asks for the current Node LTS. On 2026-10-11, Node 24 is Active LTS (active support ends ~2026-10-20). Node 26 (released 2026-05-05) is scheduled to become Active LTS in late October 2026. Production code runs on Cloudflare's `workerd`, so Node only powers local tooling (Vite, Astro, Wrangler, Vitest, Playwright).

**Decision.** Install Node 24 LTS on the dev machine. In Phase 1, set `engines.node` to `>=24` so Node 26 works too. Revisit once Node 26 is Active LTS and the pinned toolchain supports it.

**Alternatives.** Node 26 now (not yet LTS on this date). Node 22 (Maintenance LTS, older).

## D-002 — Tool installation via Homebrew on macOS (2026-10-11)

**Context.** The machine has git and Xcode Command Line Tools but no package manager, Node, pnpm, or `gh`.

**Decision.** Homebrew for `node@24` and `gh`; pnpm via its official standalone installer (`get.pnpm.io`). The repo will pin the exact pnpm version through the `packageManager` field in Phase 1, so the global pnpm version does not matter.

**Alternatives.** Official Node `.pkg` installer plus GitHub CLI `.pkg` (no single updater). nvm/fnm (extra shell setup). Corepack (no longer bundled from Node 25 on).

## D-003 — Wrangler installed per project, not globally (2026-10-11)

**Context.** Cloudflare recommends installing Wrangler locally in each project so every contributor and CI run uses the same version.

**Decision.** Wrangler becomes a pinned devDependency of the workspace in Phase 1. Before the repo exists, the human logs in with `npx wrangler login`. The OAuth login is stored per user, so it carries over to the project-local Wrangler.

**Alternatives.** Global `npm i -g wrangler` (version drift between machine and CI).

## D-004 — Email provider: Resend, behind an adapter (2026-10-11)

**Context.** The blueprint says to use Cloudflare's email sending if it is generally available on the account, and Resend otherwise. As of 2026-10-11, Cloudflare Email Service's sending feature is in **public beta** (since 2026-04-16), and sending to arbitrary recipients requires Workers Paid. It is not GA.

**Decision.** Use Resend as the v1 email provider. Implement an `EmailProvider` interface in `packages/core` with a `ResendProvider`. A `CloudflareEmailProvider` can be added later with a config switch.

Known constraint: without a verified domain, Resend only delivers to the Resend account owner's address. That is enough for preview testing by the human. Each product needs a verified sending domain before launch (it becomes a `/launch-check` item).

**Alternatives.** Cloudflare Email Service (beta, needs Workers Paid). Postmark and Amazon SES (also fine; Resend has the simplest HTTP API for Workers and a free tier of 3,000/month, 100/day).

Sources: https://developers.cloudflare.com/email-service/, https://developers.cloudflare.com/changelog/post/2026-04-16-email-sending-public-beta/, https://resend.com/pricing

## D-005: Fully automated delivery, no human approval (2026-10-11)

**Context.** Blueprint v4 replaces the human-approved production deploy with full automation (Operating rule 6, Phase 1 CI, Section 8 hard rules, Sections 11–12). The human now acts only on accounts, credentials, payments, legal review, and the production payment switch.

**Decision.** The agent commits to a feature branch, pushes, opens a PR, and runs `gh pr merge <n> --auto --squash`. GitHub merges when the required checks `verify` and `preview` pass. Every push to `main` deploys to production through `.github/workflows/deploy.yml`. Automated safeguards replace the approval step:

1. `pnpm verify` and the migration gate on the PR and again on `main`.
2. An isolated preview with a smoke test on every PR (D-008).
3. A D1 Time Travel bookmark before production migrations (D-009).
4. A post-deploy smoke test that checks the live commit SHA.
5. Automatic rollback to the previously live Worker version if the smoke test fails, plus an incident issue.
6. Expand/contract migrations, so a code rollback always works on the new schema (D-010).
7. A local permission guard against destructive commands (D-006) and server-side branch rules (D-007).

**Alternatives.** A GitHub environment with required reviewers (the blueprint v1 design, now removed). Merge queues (unnecessary for one agent working serially).

## D-006: Claude Code permissions, allowlist plus destructive-command guard (2026-10-11)

**Context.** Rule 6 asks for routine commands to run without prompts and destructive ones to stay denied. The Claude Code permissions docs (code.claude.com/docs/en/permissions) say: deny beats ask beats allow; `*` may appear anywhere; deny rules match any subcommand of a compound command. They also say Bash rules are *not* a security boundary: `git -C . push --force` or `sh -c '…'` get past a plain force-push rule.

**Decision.** Three layers in the committed `.claude/settings.json`:
- **allow:** `git`, `gh`, `pnpm`, `node`, `wrangler`, `npx wrangler`.
- **ask:** risky but legitimate actions (`git reset --hard`, `pnpm dlx`, `gh repo create/edit`, `gh secret/variable set`, ruleset and branch-protection API calls, `wrangler secret`, `wrangler rollback`).
- **deny:** force pushes, pushes to or deletion of `main`, history rewrites (rebase, filter-branch, filter-repo), `gh repo delete/archive/rename`, visibility changes, `gh api` DELETE, `gh pr merge --admin`, printing or removing the GitHub token, deleting GitHub secrets or variables, disabling workflows, any wrangler deploy / versions deploy / delete (every invocation form), remote D1 `execute`/`migrations apply`, D1 `time-travel restore`, `pnpm deploy`, `rm -rf /` and `~`, plus reads of `.dev.vars*`, `.env*`, and the gh/wrangler credential files.

On top of that, a PreToolUse hook (`.claude/hooks/guard-destructive.sh`, configured fail-closed) matches the same classes on the normalized full command text, so rephrasings are caught too. Its test suite covers 41 blocked and 23 allowed commands.

**Consequences.**
- Deleting cloud resources and restoring D1 are human-only. That includes Phase 8's cleanup of the dummy product: the agent prints the exact commands and the human runs them.
- Local production deploys are impossible by design; production changes only via CI.
- The hook scans whole command text, so a Bash heredoc that merely *mentions* a blocked command is blocked too. Agents write files with the Write/Edit tools, not heredocs.

**Alternatives.** Allow-only with no deny list (no protection). `bypassPermissions` mode (no guard at all). The sandbox (stronger OS-level isolation, but it adds friction to wrangler/gh network use; revisit if needed).

## D-007: Branch ruleset plus agent-enabled auto-merge (2026-10-11)

**Context.** Auto-merge only waits when `main` has required checks. A merge or push made with the workflow `GITHUB_TOKEN` does not trigger new workflow runs (GitHub docs), so a workflow that merges PRs itself would never trigger the production deploy.

**Decision.** `scripts/setup-github.sh` (run once in Phase 1, with the human approving the ask-listed calls):
- turns on auto-merge and delete-branch-on-merge, squash merges only;
- sets the `PRODUCTION_URL` Actions variable;
- creates a `main` ruleset: no deletion, no force push (non-fast-forward), PRs required with 0 approvals, required checks `verify` and `preview`, no bypass actors.

The agent enables auto-merge from its own `gh` session (`gh pr merge --auto --squash`). The merge then counts as the human's account and triggers `deploy.yml`. `strict_required_status_checks_policy` is off so PRs don't stall waiting for branch updates; `main` is re-verified before every deploy anyway.

**Open item.** GitHub's docs are ambiguous about rulesets on private repos for GitHub Free accounts. Phase 1 checks `gh api user --jq .plan.name`. If the ruleset call is refused, the options are: public repo, or GitHub Pro (free via the Student Developer Pack).

**Alternatives.** A workflow that merges with a PAT or GitHub App token (another long-lived secret). Classic branch protection (rulesets are the newer, API-friendlier equivalent).

## D-008: Previews on a separate Worker and D1 database (2026-10-11)

**Context.** `wrangler versions upload` on the production Worker would give the PR code production bindings, including the production D1.

**Decision.** `apps/api/wrangler.jsonc` defines the top level as **production** (Worker `<slug>`, D1 `<slug>-prod`, binding `DB`) and `env.preview` (Worker `<slug>-preview`, D1 `<slug>-preview`, same binding name). Each PR uploads a version to the preview Worker with `--preview-alias pr-<n>`, giving a stable URL per PR (`https://pr-<n>-<slug>-preview.<subdomain>.workers.dev`). The workflow applies migrations to the preview D1, smoke-tests the alias URL, and keeps one sticky PR comment updated. The first PR bootstraps the preview Worker with a CI deploy.

**To validate in Phase 1.** That `versions upload` accepts `--var` and prints the alias URL in the format the workflow parses.

**Alternatives.** One Worker per PR (needs cleanup and a D1 per PR). Versions on the production Worker (unsafe, see above).

## D-009: Production pipeline, smoke test, auto-rollback (2026-10-11)

**Decision.** `deploy.yml`, serialized by `concurrency: production`:
1. `pnpm verify`.
2. Record the live version ID (`wrangler deployments status --json`).
3. Record a D1 bookmark (`wrangler d1 time-travel info DB --json`); refuse to migrate without one.
4. `wrangler d1 migrations apply DB --remote` (non-interactive in CI; each failed migration is rolled back by D1).
5. Deploy with `--var COMMIT_SHA:<sha>`.
6. `scripts/smoke-test.mjs` checks `/api/health` returns `{status:"ok", commit:<sha>}` and `/` serves HTML, retrying for propagation. Phases 3 and 4 add the sign-in page and billing-status checks to `scripts/smoke-checks.json`.
7. On smoke failure: `wrangler rollback <previous-version> --message …`, then smoke-test the old version.
8. On any failure: open an issue with step outcomes, the bookmark, and next steps.

**Limits.**
- Rollback reverts **code only**. The database is never restored automatically, because a restore overwrites data written since the bookmark. D-010 makes code-only rollback safe; a restore is a human decision (`docs/OPERATIONS.md`, Phase 9).
- Rollback works only within the last 100 versions, and is blocked if a binding's resource was deleted or modified in between (Cloudflare docs).
- The very first production deploy has no version to roll back to.
- Free-plan Time Travel retention is 7 days (30 on Paid).

## D-010: Backward-compatible migrations (expand/contract) (2026-10-11)

**Context.** Migrations run before the new code is live, and rollback restores the old code onto the new schema. Both directions must work.

**Decision.** `scripts/check-migrations.mjs` runs on every PR against the merge base, and becomes part of `pnpm verify` in Phase 1:
- **Expand** (always allowed): new tables, nullable columns, columns with `DEFAULT`, indexes, backfill `UPDATE`s.
- **Contract** (`DROP TABLE/COLUMN/VIEW`, `RENAME`, `DELETE FROM`, `ADD COLUMN … NOT NULL` without `DEFAULT`): the file must start with the marker `-- migration: contract`, and the PR may change nothing but migrations and docs. The code that stopped using the old shape must already be in production.
- Merged migrations are immutable: editing, renaming, or deleting one fails the check.
- drizzle-kit's SQLite table rebuilds (`DROP` plus `RENAME`) count as contract migrations on purpose.

Tested against 8 scenarios. Phase 1 moves these into Vitest.

**Alternatives.** Manual review only (no human reviewer in this flow). Down-migrations (D1 has no down-migrations; Time Travel covers disasters).

## D-011: GitHub Actions pinned by commit SHA; no wrangler-action (2026-10-11)

**Decision.** Third-party actions are pinned to full commit SHAs, with the version in a comment. All versions are the latest published at least 14 days before 2026-10-11:

| Action | Version | Published |
|---|---|---|
| `actions/checkout` | v7.0.1 | 2026-07-20 |
| `actions/setup-node` | v7.0.0 | 2026-07-14 (v7.1.0 is from 2026-10-08, too new) |
| `pnpm/action-setup` | v6.1.0 | 2026-09-05; reads the `packageManager` pin |

Wrangler runs from the project's own pinned devDependency (`pnpm exec wrangler`) with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` from repo secrets, instead of `cloudflare/wrangler-action`. That is one less third-party action, and CI uses exactly the wrangler version used locally.

## D-012: Dependency versions for Phase 1 (2026-10-11)

**Rule.** The latest stable version published at least 14 days ago (cutoff 2026-09-27), pinned exactly, chosen with `scripts/pick-versions.mjs`. pnpm also enforces the rule for transitive dependencies through `minimumReleaseAge: 20160` with `minimumReleaseAgeStrict` in `pnpm-workspace.yaml`. Shared versions live in the pnpm `catalog`.

| Package | Version | Note |
|---|---|---|
| pnpm | 12.7.0 | `devEngines.packageManager` with `onFail: download`; 12.11.2 is too new |
| Node | 24.21.0 | `.nvmrc` (D-001) |
| turbo | 2.11.4 | |
| @biomejs/biome | 2.5.14 | 2.5 uses `rules.preset` |
| vitest | 4.1.11 | Not 5.x: the Workers test plugin's eligible version needs `^4.1` |
| @cloudflare/vitest-plugin | 1.2.8 | `@cloudflare/vitest-pool-workers` was renamed; `cloudflareTest()` |
| wrangler | 4.141.0 | Matches vitest-plugin's pin; `compatibility_date` 2026-09-25 matches its workerd |
| hono | 4.13.9 | |
| zod | 4.6.5 | |
| typescript | 6.0.3 | See D-014 |
| @tanstack/react-query | 5.104.0 | |
| expo | 57.0.25 | SDK 57 is current stable; SDK 58 is beta |
| Expo-managed packages | SDK 57's `bundledNativeModules`, newest eligible patch in its range | react 19.2.3, react-dom 19.2.3, react-native 0.86.3, expo-router 57.0.23, react-native-web 0.21.3, react-native-screens 4.26.2, react-native-safe-area-context 5.7.0, @types/react 19.2.18 |

**Exceptions.**
- **Expo pins override "latest".** A version Expo doesn't expect breaks native builds, and `expo install --check` flags it.
- **pnpm `overrides` for two optional peers that pnpm auto-installs at their newest version:** `@react-native/metro-config` 0.86.3 and `react-native-worklets` 0.10.1. Both align with SDK 57.
- **`allowBuilds` lists only esbuild and workerd,** because pnpm 12 blocks unreviewed install scripts.

## D-013: Expo web export served by the Worker; API calls (2026-10-11)

**Web build.** The app uses `web.output: "single"`, so `expo export` produces one `index.html` plus bundles in `apps/app/dist`. The Worker serves it through Workers Static Assets with `not_found_handling: "single-page-application"`. `run_worker_first: ["/api", "/api/*"]` sends only API paths to Hono. Verified locally: deep links return the app, unknown `/api/*` paths return 404.

**Config.** `app.config.ts` reads name, slug, and scheme from `product.config.ts`. It imports with an explicit `.ts` extension, which Expo's config loader on Node 24 needs.

**API calls.**
- The client is Hono RPC: `hc<AppType>()` in `apps/app/src/core/api.ts`. The app has a type-only dev dependency on `@factory/api`.
- `api-base.web.ts` uses `EXPO_PUBLIC_API_URL || window.location.origin`. `api-base.ts` (native) requires `EXPO_PUBLIC_API_URL`.
- In local dev, `pnpm dev` sets `EXPO_PUBLIC_API_URL=http://localhost:8787`. The API allows CORS only for localhost origins, and only when it is itself served from localhost.

**API types.** The API declares its `Bindings` type explicitly instead of relying on `worker-configuration.d.ts` globals. That lets the Expo package type-check the RPC client against the API source without Worker ambient types. Phase 2 must keep this property: import D1 types explicitly in code reachable from `AppType`.

**Turbo graph.** `@factory/app#build` has no dependencies, and `@factory/api#build` depends on it, because the API's dry-run bundle needs the assets directory. Explicit task deps avoid a package-graph cycle.

## D-014: TypeScript 6.0.3 everywhere, not 7.0 (2026-10-11)

**Context.** TS 7.0.2 (the native compiler) is npm `latest`, but it ships no JS API. Expo SDK 57 doesn't officially support it: its templates pin `~6.0.3`, and Expo states "This does not imply TypeScript v7 support". `@astrojs/check` (Phase 6) requires TS ≤6. The TS team's own advice is to keep 6.0 alongside 7 for such tools.

**Decision.** A single `typescript@6.0.3` for the whole repo. tsconfigs avoid every option that TS 6 deprecated, so moving to 7 later only means changing the version.

**Revisit** when Expo officially supports TS 7 or TS 7.1 ships its API.

**Alternatives.** Side by side, `@typescript/native` (7) as the checker plus a 6.0 alias for tools. Faster, but two compilers in a template meant to stay simple for agents, and Expo tooling flags the alias.

## D-015: Core data model and entitlement logic (2026-10-11)

**Versions.** drizzle-orm 0.45.3 and drizzle-kit 0.31.11, the stable line. Drizzle's docs now show the 1.0 RC, which is a pre-release and changes the migration folder layout, so it's excluded until stable. Migrations are generated by drizzle-kit (`dialect: sqlite`, `prefix: timestamp`) and applied by wrangler from `packages/db/migrations`. Wrangler ignores the `meta/` folder.

**Databases.** D1 `factory-template-prod` (`a30e51f0…`) and `factory-template-preview` (`c7642715…`), region APAC. Both use binding `DB` and the same `migrations_dir`.

**Schema choices.**
- Timestamps are `integer` epoch ms (UTC) and amounts are integer IDR, both portable to Postgres.
- Enums are text columns with TypeScript enums, not SQL CHECKs.
- `user_id` columns are indexed but are **not** foreign keys to Better Auth's `user` table. That table arrives in Phase 3, and adding a FK later in SQLite would need a table rebuild (a contract migration). Integrity is enforced in code.
- Integrity rules live in the database, where they hold under concurrency:
  - a partial unique index for "one trial per user" (`WHERE source = 'trial'`);
  - a unique `entitlements.payment_id` so a payment grants at most once;
  - a unique `(provider, provider_ref)` on payments and a unique `(provider, event_key)` on webhook events;
  - a unique `(entitlement_id, kind)` so each reminder kind is sent once.
- `payments.expires_at` was added (not in the Section 5 table) because the pending-payment expiry cron needs it.

**Logic.** `packages/core/entitlements`:
- `hasAccess`, `grantTrial`, `grantFromPayment` (idempotent per payment), `grantAdminDays`.
- Periods extend from `max(now, latest expiry)`.
- Months are calendar months in UTC, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29).
- D1 has no interactive transactions, so two *different* payments landing in the same instant could compute the same start. That's accepted and documented; the payment-level unique index rules out double grants.

**Tests.** 8 integration tests on a real local D1 through `@cloudflare/vitest-plugin` and `applyD1Migrations` (same migrations as CI), plus 6 unit tests for the date math.

## D-016: Auth with Better Auth 1.7.6 (2026-10-11)

**Versions.** `better-auth` 1.7.6, and the CLI `auth` 1.7.6, because `@better-auth/cli` is deprecated and renamed.

**Setup.**
- `apps/api/src/core/auth.ts` builds the instance per isolate with `getAuth(env)` and does no `cloudflare:workers` import. That keeps the RPC type graph free of Worker ambient types (D-013).
- Drizzle adapter on D1 (`provider: sqlite`). The auth tables are generated by `pnpm --filter @factory/api auth:schema` into `packages/db/src/core/auth-schema.ts`, and their migration is `…_auth_tables.sql` (expand-only).
- The generated defaults use SQLite's `unixepoch()`. This is accepted because the generator emits dialect-specific SQL, and a Postgres move would regenerate it.

**Host handling.** `baseURL` is dynamic, with `allowedHosts` from the per-environment `AUTH_HOSTS` var (production host; preview host plus `*-factory-template-preview…` aliases; `localhost:8787` in dev). Requests for any other host are rejected (tested). Session lookup goes through Better Auth's own `/get-session` handler in-process, because direct `auth.api.getSession` can't resolve a dynamic `baseURL` and returned null.

**Sign-in methods.**
- **Magic link:** 15 minutes, single use, hashed token, sent through `@factory/core/email`. Captured locally and printed to the wrangler log in dev.
- **Google:** enabled only when both `GOOGLE_*` secrets exist; the `/api/me` `providers` field tells the UI whether to show the button. Previews use magic link only: their URLs change per PR, and the `oAuthProxy` plugin would add a shared secret and wildcard trusted origins. Revisit if needed.

**Consent.** Magic-link metadata isn't persisted, so consent is a post-sign-in step. The app's protected layout routes to `/consent` until `/api/me` reports no `missingConsents`. `POST /api/consents` requires a session and every mandatory consent at its current version (`CONSENT_VERSIONS`). `sensitive_data` is added when `legal.sensitiveDataConsent` is on.

**Rate limits.** Explicitly enabled (the default follows `NODE_ENV`, which Workers lack) and stored in D1, because isolates don't share memory. The client IP comes from `cf-connecting-ip`. Magic link allows 3 per minute per IP, verify 10 per minute, social 10 per minute. On only in production and preview; `test/rate-limit.test.ts` proves the 4th request gets 429.

**Secrets per deployed environment** (documented in `.dev.vars.example`):
- `BETTER_AUTH_SECRET` is required, otherwise `/api/me` fails, and the new smoke check catches that.
- `RESEND_API_KEY` is required for sign-in emails.
- `GOOGLE_*` are optional.

**E2E.** Playwright 1.63.0 runs against `wrangler dev` (built app plus API plus local D1, `APP_ENV=development`). It reads the magic link from `/api/dev/last-email`, which only answers when `APP_ENV=development` *and* the host is localhost. E2E is part of `pnpm verify`, and CI installs Chromium.

**Native (Phase 10, auth).** See the end of this entry.

## D-017: Billing with Duitku POP behind PaymentProvider (2026-10-11)

**Interface.** `packages/core/billing/provider.ts` implements Section 6. It adds `getStatus` (confirm with the provider before granting) and `webhookAck`, and `verifyWebhook` returns our `paymentId`. Classes: `DuitkuProvider`, plus `FakeProvider` for tests and local dev. A new provider means a new class plus `product.config.ts` `payments.provider`. `getProvider(env)` picks Duitku when its secrets exist, Fake in development/test, and fails otherwise.

**Duitku facts** (docs read 2026-10-11; see the research notes in STATUS):
- **Signatures:** every signature is HMAC-SHA256 keyed with the apiKey, lowercase hex. MD5/SHA256 have been obsolete since Apr 2026. Invoice signs `merchantCode+timestamp(ms)`, callback `merchantCode+amount+merchantOrderId` (raw amount string), status `merchantCode+merchantOrderId`. Implemented with WebCrypto and cross-checked against Node's HMAC in tests.
- **Callback:** form-urlencoded, parsed with `URLSearchParams`. Only `resultCode=00` counts as paid, because the docs disagree on 01 vs 02 for failure. eventKey is `merchantOrderId:resultCode:reference`, so retries dedupe. Duitku retries up to 5 times until it gets a 200.
- **Status API** (different host: `sandbox.duitku.com` / `passport.duitku.com`): called **once per webhook**, never by the cron, because Duitku blocks merchants that poll it.
- **Payment methods:** POP can't take a subset; `paymentMethod: ""` shows every channel enabled on the Duitku project. So `product.config.ts` `payments.methods` documents intent, and the human enables those channels in the Duitku dashboard.
- **Amounts:** minimum 10,000 IDR, enforced before the API call. One `itemDetails` line equal to the total, because Duitku requires item prices to sum to `paymentAmount`.
- **Mode:** `DUITKU_MODE` is a wrangler var set to `sandbox` on both environments. Only the human switches it to production (Operating rule 7).

**Flow.**
- `POST /api/billing/checkout` requires a session plus the required consents. It writes a `pending` payment row (expires in 60 minutes) before calling the provider, then returns `redirectUrl`. A provider failure marks the row `failed`.
- `POST /api/webhooks/:provider`: verify (401 on a bad signature), insert `webhook_events` (a duplicate stops there), confirm with `getStatus`, update the payment, grant an extending entitlement, send the receipt email (a failure there is logged and never makes the provider retry), ack.
- `GET /api/billing/status` is owner-only. `GET /api/billing/history` serves the Akun page. `POST /api/billing/trial` is for the "Mulai trial" click.
- The return page polls our status endpoint and never trusts the redirect's `resultCode`.

**Cron.** `*/30 * * * *` on production only (`env.preview.triggers.crons = []` saves cron quota and preview email noise).
- Expires stale pending payments.
- Sends renewal reminders: 7 days before, 1 day before, and on expiry (caught within 3 days), using only each user's latest entitlement, so users who already renewed get nothing.
- Each reminder is marked in `reminders_sent` *before* sending, so overlapping runs can't double-send.

**Access gate.** The `requireAccess` middleware returns 401 when signed out and 402 without an entitlement. The example paid feature (`apps/api/src/features/example.ts` + `apps/app/src/features/example`) shows the pattern and is deletable.

**Native store rules.** The pricing screen and paywall render no prices or checkout links on native. `openCheckout` exists only in `*.web.ts`; the native version throws.

**Local dev.** `/api/dev/fake-pay` (development + localhost only) plays the hosted payment page. It runs the *real* webhook handler with a signed fake event, so E2E covers checkout → webhook → access.

**Tests.**
- 8 provider-agnostic service tests and 8 endpoint tests (bad signature, replay, unconfirmed "paid", failure, unknown payment, expiry, owner-only status, requireAccess 401/402/200, trial once, receipt email, reminder once).
- 8 Duitku unit tests.
- 2 billing E2E tests.

**Native (Phase 10, auth).** Add `@better-auth/expo` (server plugin plus `expoClient` with SecureStore), add the app scheme to trusted origins, and use ID-token Google sign-in. Endpoints and session reads stay unchanged.

## D-018: App shell with NativeWind v4, Reusables-style UI kit, generated theme (2026-10-11)

**Styling.** NativeWind 4.2.7 with Tailwind 3.4.19. NativeWind v5 is still `5.0.0-rc.0`, a pre-release that depends on `react-native-css` RC, and React Native Reusables only ships NativeWind v4 and Uniwind registries.

**pnpm workarounds** (nativewind#1849, #1833):
- `react-native-css-interop` 0.2.7 and `@babel/plugin-transform-react-jsx` 7.29.7 are direct app dependencies. Babel 7, *not* 8: `babel-preset-expo` uses ^7.
- `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, and `react-native-svg` 15.15.4 use the SDK 57 pins.

**Known bug avoided:** on React Native 0.86, NativeWind 4.2.7 drops styles when a `Pressable` gets a function `style` (nativewind#1834). Our components use `className` only, noted in `button.tsx`.

**Config.**
- `babel.config.js` uses the `nativewind` jsxImportSource plus the `nativewind/babel` preset; the worklets plugin is added by `babel-preset-expo`.
- `metro.config.js` is `withNativeWind(getDefaultConfig())` with absolute paths.
- `tailwind.config.js` uses `darkMode: class` and colors as `hsl(var(--token) / <alpha-value>)`. Its content globs cover `apps/app/src` and `packages/ui/src`.
- `apps/app` dropped `"type": "module"` so these configs stay CommonJS.

**Theme from `product.config.ts`.**
- `brand.tokens.colors.{light,dark}` use Reusables/shadcn token names, as hex validated by Zod.
- `scripts/gen-theme.mjs` writes `apps/app/global.css` (Tailwind directives plus `:root` and `.dark:root` HSL channels and `--radius`). `pnpm theme` regenerates it, and `verify` fails if it's stale (`--check`).
- Generated rather than `@import`ed, because Tailwind 3 under NativeWind doesn't inline imports.
- The Astro site (Phase 6) reuses `renderTheme()`.

**Dark mode.** Light, dark, or system, chosen on the Akun page and saved in localStorage (in-memory on native until Phase 10). NativeWind's class mode doesn't apply the `dark` class for `"system"` on web, so `core/theme.ts` resolves system through React Native's `Appearance` and follows device changes. Verified in the browser with emulated dark mode.

**UI kit.** `packages/ui` holds hand-written components in React Native Reusables' API and style:
- `cn()`, `Text` (variants plus `TextClassContext`), `Button` (cva variants), `Card` family, `Input`, accessible `Checkbox`, `Screen`, `CenteredScreen`, `Loading`, `Badge`, `Separator`, `ErrorText`.
- Reusables' CLI (`@react-native-reusables/cli` 0.7.1) can add more components later.
- react, react-native, nativewind, and react-native-svg are peer dependencies, so only one copy exists.

**i18n.** `I18nProvider` and `useI18n()`: `id` by default, `en` selectable on the Akun page, choice saved (web). Every screen uses keys.

**Akun page** (all from `/api/account/*`):
- profile and sign-out;
- subscription status with the expiry date in WIB, plus renew and subscribe buttons (web only);
- payment history;
- language and theme;
- data export (JSON download, web; native in Phase 10);
- account deletion: type `HAPUS`. Personal data is deleted. Payments are kept with the user identity removed (user link replaced with `deleted:<uuid>`, raw provider payload dropped) for financial record-keeping. Sessions end.

**Dev-only endpoints** (development *and* localhost, for E2E): `/api/dev/last-email`, `/api/dev/fake-pay`, `/api/dev/expire-access`.

**Pending for acceptance.** Lighthouse (mobile performance ≥ 80, accessibility ≥ 90) must be measured on the deployed preview. Home and Akun must also render in a native dev build on a phone (human, Expo Go).

## D-019: Marketing site with Astro 7 on an assets-only Worker (2026-10-11)

**Stack.**
- astro 7.3.5 (static), @astrojs/sitemap 3.7.4, @astrojs/check 0.9.10. The check requires TS ≤ 6, which confirms D-014.
- Tailwind 4.3.3 through @tailwindcss/vite 4.3.3. `@astrojs/tailwind` only supports Astro ≤ 5. The app stays on Tailwind 3 because NativeWind 4 needs it.
- Both read the same generated tokens: `scripts/gen-theme.mjs` now also writes `apps/site/src/styles/tokens.css`, mapped with `@theme inline { --color-x: hsl(var(--x)); }`.
- Dark mode follows the device: an inline script sets `.dark` on `<html>` before paint.

**Pages.**
- Landing (hero, features, pricing, FAQ) and `/harga/`. Plans come from `product.config.ts`, and a test checks the built HTML.
- SEO content pages from `src/content/seo/*.md`: file name = URL, frontmatter title (10–70 chars) and description (50–170) validated, optional FAQ rendered with FAQPage JSON-LD.
- `/privasi/` and `/syarat/`: Bahasa Indonesia templates following UU PDP, with `{{placeholders}}` filled from config (`legal.*`, plans, trial). They render through `marked` 18.0.14.
- `/kontak/` and `404`.

**Legal banner.** "TEMPLATE — perlu review hukum sebelum launch" shows unless it's a production build *and* `legal.reviewed: true`. Only a human sets `reviewed`, after legal review; this is a launch-check item.

**SEO.**
- `<html lang>`, a unique title and description per page (tested), canonical URLs with trailing slashes matching Cloudflare's `auto-trailing-slash`, OG and Twitter tags.
- JSON-LD: Organization, Product with IDR Offers, FAQPage.
- Sitemap. `robots.txt` allows indexing **only in production** (`PUBLIC_APP_ENV=production`); previews disallow.
- OG images: 1200×630 PNGs per page, generated at build time with satori 0.33.5, @resvg/resvg-wasm 2.6.2 (no native deps), and @fontsource/inter 5.3.0 `.woff` files (OFL).

**Analytics.** `@factory/core/analytics` holds the standard event names (Section 9 plus the Section 6b funnel events), a `feature_*` convention, and PII scrubbing (email/phone/name keys and values) with tests. The site fires `site_view` / `pricing_view` and `data-event` clicks (`signup_started`, `checkout_started`) through `window.factoryTrack`, which is a no-op until OpenPanel is wired in Phase 7.

**Deploy.**
- `apps/site/wrangler.jsonc`: assets-only Worker `factory-template-site` (production) plus `env.preview` (`factory-template-site-preview`), `not_found_handling: 404-page`. This is Cloudflare's recommendation for new static projects.
- PR: build the site with `PUBLIC_APP_URL` set to the app preview, bootstrap the site preview Worker, upload alias `pr-<n>`, smoke-test it (`scripts/smoke-checks.site.json`, 7 checks), and add a site link to the sticky comment.
- main: after the app is healthy, build with `SITE_URL` / `PUBLIC_APP_URL` / `PUBLIC_APP_ENV=production`, record the live site version, deploy, smoke-test, and roll back the site alone on failure. The app rollback now triggers only when the *app* smoke test fails.
- New repo variable `SITE_URL` (`scripts/setup-github.sh` 3rd argument).

**Lighthouse (local, mobile emulation, 2026-10-11).**
- Site (production build): landing 100/100/100 (performance/accessibility/SEO); pricing 100/98/100; SEO page 100/95/100; legal 100/100/100. Target: SEO ≥ 95.
- App sign-in: performance 79–82, accessibility 95. Targets: ≥ 80 / ≥ 90.
- The audit caught two problems:
  - `lucide-react-native` pulled the whole icon set into the web bundle (Metro doesn't tree-shake), taking it from 2 MB to 4.2 MB. The single check icon is now drawn with react-native-svg and lucide was removed.
  - Expo Router `asyncRoutes` made the bundle *larger* (3.1 MB common plus 1.1 MB entry), so it stays off.
- The app's `/robots.txt` disallows all, because the app is behind login and SEO lives on the site.
- **Re-measure the app on the real preview:** performance is borderline.

## D-020: Admin and factory tooling (2026-10-11)

**`/admin`** (Phase 7, admin part).
- Access: `requireAdmin` (401 signed out, 403 otherwise). Admins are `product.config.ts` `admin.emails` ∪ the `ADMIN_EMAILS` var (case-insensitive). In local dev `pnpm dev` adds `admin@example.com`.
- Users and active access: active users are classified by the source of their latest-ending entitlement (trial / paid / admin grant / store).
- Revenue by month: paid payments grouped by **Asia/Jakarta** month in JavaScript (portable SQL), plus count.
- Recent payments with email; deleted accounts show "(akun dihapus)".
- Webhook event log.
- Manual grant of N days (1–366): extends, never overlaps.
- Tests check the numbers against direct DB queries (Phase 7 acceptance). E2E: an admin grants access and the link is hidden from non-admins.
- **Still Phase 7, blocked on accounts:** OpenPanel (wire `window.factoryTrack` and the app tracker to it) and Sentry (`@sentry/cloudflare` plus browser SDK with PII scrubbing). Both need the human's accounts (SETUP_HUMAN steps 5–6).

**Factory tooling** (Phase 8).
- `scripts/spec-check.mjs`: enforces the spec format. Required sections must be non-placeholder, there are at most 3 core features, and kill criteria must exist. Tests run against the unfilled template (rejected) and the `specs/catatan-harian.md` dummy (accepted).
- `scripts/new-product.mjs`: a **dry run by default**; `--execute` acts.
  - Steps: spec check → `gh repo create --template` → rewrite `product.config.ts` (slug, name, tagline, plans from the spec) → rename Workers/DBs/hosts in the wrangler and astro configs → `wrangler d1 create` both DBs and write the ids → theme → commit and push → `setup-github.sh` → `CLOUDFLARE_ACCOUNT_ID` secret → register in this repo's `factory.json`.
  - The API token is never copied; the human runs `gh secret set CLOUDFLARE_API_TOKEN --repo …`.
  - R2 is not created yet: no feature uses it, and enabling R2 on an account is a dashboard step.
  - The transforms are pure functions with tests.
- **Playbooks** in `.claude/skills/`, all `disable-model-invocation: true` (human-triggered): `new-product`, `build-from-spec` (refuses incomplete specs), `add-feature`, `add-plan`, `launch-check` (13 items mapped to commands; template-N/A items marked), `sync-template`.
- `docs/TEMPLATE_SYNC.md`: template remote, merge (never rebase), conflict table by ownership. Migrations keep both sides thanks to timestamp prefixes, and the lockfile and drizzle meta are regenerated.
- **Phase 8 acceptance pending:** create the "Catatan Harian" dummy end to end, then **the human deletes** the dummy repo, Workers and D1 (agents are denied deletes, D-006).

## D-021: Security hardening (Phase 9, 2026-10-11)

**Headers.**
- `/api/*`: Hono `secureHeaders` with `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS 1 year, nosniff, `Referrer-Policy: no-referrer`, COOP/CORP same-origin.
- App HTML: `apps/app/public/_headers`. Workers static assets serve it, and `wrangler dev` honours it, which E2E `security.spec.ts` asserts. `script-src 'self'` (the export has no inline scripts). `style-src` keeps `'unsafe-inline'` because React Native Web injects styles at runtime. `connect-src 'self' https:` leaves room for OpenPanel and Sentry.
- Site: Astro `security.csp` (hash-based `<meta>`) plus `public/_headers` for what a meta tag can't carry (`frame-ancestors`, nosniff, HSTS).
- The site now has **no inline executable scripts**. Dark mode is `/theme.js` and analytics is a bundled module, with `vite.build.assetsInlineLimit: 0` so Astro never inlines them. The first attempt with Astro's hashes left the dark-mode script blocked in the browser. A build test now fails on any inline script.

**Rate limits.**
- Workers rate limiting binding (`ratelimits`, periods of 10 or 60 s only):
  - Checkout: 10 per minute per user.
  - Webhooks: 120 per minute per IP.
  - Auth: Better Auth's own D1-backed limit (D-016).
- Counters are per Cloudflare location and eventually consistent, so this is abuse protection, not accounting.
- Namespaces are account-wide, so keys carry the product slug. Preview uses separate namespace ids (1003/1004).
- Tests run against Miniflare's real binding.

**Input validation.**
- Every body and query that reaches logic goes through Zod: `planId` ≤ 64, `paymentId` must match `pay_<32 hex>`, deletion needs `confirm: "HAPUS"` exactly.
- A 64 KB body limit applies to `/api/*` (413).

**Client bundle secrets.**
- `scripts/check-bundle-secrets.mjs` runs in `pnpm verify` after the build. It looks for credential-looking values and for server-style env access (`.BETTER_AUTH_SECRET` and similar).
- A bare name is allowed, because Better Auth's client ships a harmless env getter. The first run flagged it, and inspection showed no value.

**Dependency audit (`pnpm audit --prod`, 11 advisories).**
- None is in the Worker runtime. All are build/dev tooling: Metro, Expo CLI, react-native dev tools, Astro build (sharp, http-cache-semantics), drizzle-kit's esbuild, satori.
- Patched now: `fflate` 0.7.5 (override, same minor, older than 14 days).
- Not yet eligible under the 14-day rule:

  | Package | Version | Eligible from |
  |---|---|---|
  | sharp | 0.35.5 | 2026-10-12 (patched 2026-10-12: override, same minor) |
  | source-map-js | 1.2.2 | 2026-10-14 |
  | shell-quote | 1.11+ | 2026-10-16 |
  | http-cache-semantics | 4.3.0 | 2026-10-18 |

  Add them as overrides then (follow-up).
- No same-major fix exists for `uuid` (7 → 11), `postcss-selector-parser` (6 → 7, Tailwind 3), `decode-uri-component` (0.2 → 0.5), `node-forge`, or `braces`. These wait for upstream (Expo/NativeWind) updates.

## D-022: DOKU Checkout adapter (Phase 9, 2026-10-11)

- `DokuProvider` implements the same `PaymentProvider` interface. Select it with `product.config.ts` `payments.provider: "doku"` plus the `DOKU_CLIENT_ID` / `DOKU_SECRET_KEY` secrets. `DOKU_MODE` stays `"sandbox"`.
- **Non-SNAP signatures**, from the official docs read 2026-10-11:
  - Signature: `HMACSHA256=` + base64 HMAC-SHA256 over the `Client-Id`, `Request-Id`, `Request-Timestamp` (ISO UTC with no milliseconds), `Request-Target` (path) and `Digest` lines.
  - Digest: base64 SHA-256 of the exact body bytes sent or received. GET requests have no Digest line.
  - Tests check every signature against an independent Node `crypto` implementation, plus a tampered body, wrong secret, wrong path and wrong client id.
- **FAILED is not final.** DOKU's Checkout guidance says to ignore `FAILED`, because the customer can retry with another channel. Both the webhook and the Check Status mapping treat it as pending.
  - SUCCESS → paid. EXPIRED → expired. REFUNDED/VOIDED → failed. Not Found → pending.
  - A later SUCCESS is a distinct event key, so it is never dropped as a duplicate.
- **Invoice number** = the hex part of our payment id. It is alphanumeric, 32 characters, and maps back without a lookup. DOKU caps card-enabled invoices at 30 characters, so card payments would need a shorter id (not used: the template's methods are QRIS, e-wallets and VA).
- **Status lag → retry.** DOKU says Check Status may lag a notification (~60 s). When a signed webhook says paid but the provider doesn't confirm yet, `handleWebhook` deletes the event row and returns `retry`, and the route answers 503 so the provider redelivers. DOKU retries at 30 minutes, 6 hours and 12 hours.
  - This applies to every provider. Before this change, an unconfirmed "paid" callback was acknowledged and dropped.
- **Notification URL** is set per channel in the DOKU Back Office, not per request (SETUP_HUMAN step 3b). Sandbox notifications go to the fixed preview Worker.
- `payment_method_types` is omitted: the checkout shows the channels enabled in the dashboard, as with Duitku (D-017). DOKU's channel names weren't confirmed against our method ids.

## D-023: Metro resolves React Native packages as singletons (2026-10-11)

- **Found in the Phase 1 Expo Go test.** Native screens rendered completely unstyled; web was fine.
- **Cause:** pnpm gave `packages/ui` its own `nativewind` and `react-native-css-interop` copies, because its devDependencies resolve a different peer set (for example reanimated 4.7.0 instead of 4.5.1). The second css-interop instance keeps its own style store. `global.css` injected the styles into the app's copy, but `packages/ui`'s JSX read the other copy. Web uses real CSS, so it never showed there.
- **Fix:** `apps/app/metro.config.js` resolves `react`, `react-native`, `nativewind`, `react-native-css-interop`, reanimated, worklets, safe-area-context and svg from `apps/app` for every importer. Checked on a real iPhone: styles, tokens and the API call over LAN all work.
- Any new shared package with native peers must be added to `SINGLETONS`.

## D-024: OpenPanel analytics wired (2026-10-11)

- **Package:** `@openpanel/web` 1.4.1, in the catalog, published 2026-05-07.
  - It sends a POST to `https://api.openpanel.dev/track`, allowed by our CSP `connect-src https:`.
  - It uses no cookies or localStorage; the vendor states it is cookieless.
  - The OpenPanel server checks the request Origin against the client's allowed domains. These are set to the production site and app hosts, without a preview wildcard.
- **Client ID** lives in `product.config.ts` `analytics.openpanelClientId`. It is public: browsers carry it. The client secret and the MCP token are never stored in the repo. `/new-product` resets the ID to `null`, so each product gets its own project.
- **Production only.**
  - The site sets `data-op-client` only in a `PUBLIC_APP_ENV=production` build; a build test asserts it is absent otherwise.
  - The app sends nothing until `/api/health` reports `env: "production"`. Events tracked before that are queued.
  - Previews, local dev and E2E therefore never reach OpenPanel.
- **Every event goes through `@factory/core/analytics`** (`createAnalytics(openPanelProvider(op))`): only standard names or `feature_*`, with PII scrubbed. Users are identified by their opaque user id only, never email or name, and `clear()` runs on sign-out and on account deletion.
- **Events wired:**

  | Where | Events |
  |---|---|
  | Site | `site_view`, `pricing_view`, `signup_started` and plan clicks (`data-event`), outgoing links |
  | App | screen views (SPA history), `signup_started`, `signup_completed` (consent accepted), `pricing_view`, `trial_started`, `paywall_shown`, `checkout_started`, `payment_paid` / `payment_failed` (return page), `account_deleted` |

- **Native:** a no-op with the same API (`analytics.ts`). Phase 10 adds `@openpanel/react-native`.
- **Not wired yet:** `renewal_reminder_sent` and `entitlement_expired` happen on the server (cron), and sending them needs the client secret as a Worker secret. Follow-up.

## D-025: Sentry error monitoring (2026-10-11)

- **SDKs:** `@sentry/cloudflare` and `@sentry/browser` **11.0.0**, the newest ≥ 14 days old. They ship in lockstep and are pinned together in the catalog. With v11:
  - `sendDefaultPii` is gone (replaced by `dataCollection`).
  - `honoIntegration` is gone.
  - **Everything is collected by default:** user info, cookies, headers, bodies and query strings.
- **DSN** lives in `product.config.ts` `monitoring.sentryDsn`. It is public and can only submit events. `/new-product` resets it to `null`, like the OpenPanel client ID. The auth token is never stored.
- **Privacy, enforced twice:**
  - Every init sets `dataCollection` with all personal-data collectors off (`PRIVATE_DATA_COLLECTION`).
  - `beforeSend` and `beforeBreadcrumb` run `@factory/core/monitoring` scrubbers on top. The user is reduced to an opaque id. Request data is reduced to method plus URL without query or fragment (this covers magic-link tokens and payment ids). Extra data and request contexts are dropped. Emails, Indonesian phone numbers and `token=` / `secret=`-style pairs inside messages are redacted.
  - No tracing, no replay. The browser drops `BrowserSession`, which sends the IP.
- **Worker:**
  - `withSentry` wraps `{ fetch, scheduled }`. It reports only from `production` and `preview`; dev and tests get no client.
  - `app.onError` reports errors that Hono catches and answers a generic `{ error: "internal_error" }` 500, so internals never reach clients.
  - Needs `compatibility_flags: ["nodejs_compat"]`, because the SDK uses AsyncLocalStorage.
  - The bundle is 3.4 MB raw / 601 KiB gzip, under the Workers free-plan limit.
- **Web app:**
  - Reports only when `/api/health` says production or preview. One shared request (`deploy-env.web.ts`) serves both analytics and monitoring.
  - Sentry is a lazy chunk (~1.1 MB raw; Metro doesn't tree-shake) loaded after `load` plus idle, so it never competes with the first screen. The entry bundle grew by 3 KB.
  - Superseded by D-026: the SDK now loads on the first error. While verifying #17 on preview, hidden tabs never went idle, so the idle-based loading never ran.
  - The root `ErrorBoundary` reports render errors.
- **Native and site:** native is a no-op until Phase 10 (`@sentry/react-native`). The static site has no Sentry: it has very little JS.

## D-026: App performance: Sentry loads on the first error; sign-in renders at once (2026-10-11)

- **Lighthouse on production (mobile):**
  - Site 98–100 on every category.
  - App `/sign-in`: performance **61–62**, LCP 6.3 s.
  - The app's SEO score of 63 is expected, because the app is `noindex` behind login and SEO targets apply to the site.
- **Two causes:**
  - The lazy Sentry chunk (257 KB gzip) still loaded inside the measurement window, after load plus idle plus a 3 s timeout.
  - The sign-in screen showed a spinner until `/api/me` answered, so LCP waited for all the JS plus an API round trip.
- **Fixes:**
  - **Sentry loads on the first error.** Tiny `error` / `unhandledrejection` listeners run from startup and buffer up to 10 errors; the first one fetches the SDK, then Sentry's own handlers take over. Sessions without errors download nothing, and no breadcrumbs from before the error exist (also better for privacy). Supersedes the idle-loading in D-025.
  - **Sign-in renders immediately.** A signed-in visitor is redirected when `/api/me` answers.
- **Result** (local Worker in production mode, three runs): performance **79 / 80 / 81**, LCP 3.8–4.1 s, TBT 300–350 ms. The Sentry chunk is not requested.
- **Remaining cost:** the 2 MB (494 KB gzip) entry bundle. Expo Router `asyncRoutes` made it larger (D-019), so splitting needs a different approach.
  - Follow-up: audit the heaviest modules (better-auth client, zod, react-query, i18n) and lazy-load per route where Metro allows.

## D-027: New products deploy on their first PR, with auth secrets from CI (2026-10-11)

Preparing the Phase 8 dummy showed two gaps that would break the first deploy of **every** new product:

1. **`BETTER_AUTH_SECRET` chicken-and-egg.** `wrangler versions secret put` needs an existing Worker, but a brand-new Worker's first smoke test already needs the secret (`/sign-in`, `/api/me`). With no rollback target on a first deploy, that would leave production broken.
2. **`gh repo create --template` pushes to `main` immediately.** `deploy.yml` ran before `setup-github.sh` and the Cloudflare token existed, then failed and opened an incident.

**Fixes:**
- **Auth secrets from GitHub.**
  - `/new-product` stores random `BETTER_AUTH_SECRET_PRODUCTION` and `BETTER_AUTH_SECRET_PREVIEW` repo secrets: 48 bytes each, piped on stdin, never in argv or logs.
  - CI writes a `--secrets-file` and passes it to the preview bootstrap, every preview version upload, and the production deploy. The file is additive, so other Worker secrets (Resend, Duitku) are kept.
  - When the GitHub secret is unset, as on the template itself, the file is `{}` and nothing changes.
- **`deploy.yml` config gate.** A `config` job checks for the `CLOUDFLARE_API_TOKEN` secret and the `PRODUCTION_URL` variable. Without them, the deploy job is skipped with a notice. That is not an incident. The first deploy happens on the first push to `main` after setup, which is the first PR merge.
- Verified in the pinned wrangler 4.141.0: `--secrets-file` exists for both commands.

## D-028: Product extension points found by the Phase 8 dummy (2026-10-11)

Building "Catatan Harian" from its spec in a real product repo showed places where a product had to touch template-owned code. Per the playbook, they are fixed in the template first and synced into products:

- **Feature UI strings.** All strings lived in `apps/app/src/core/i18n` (template-owned).
  - Products now put theirs in `apps/app/src/features/messages.ts` (product-owned). That file is merged into the core catalogs, and `MessageKey` covers both.
  - `en` is typed from `id`, so a missing translation fails the typecheck. A test also checks key parity and that no feature key shadows a core key.
- **UU PDP access and erasure for product tables.**
  - Core export and delete only knew core tables. `apps/api/src/features/user-data.ts` (product-owned) now has two hooks:
    - `exportProductData` is added to `/api/account/export` under `product`.
    - `deleteProductData` runs before the core delete.
  - Tables with `ON DELETE CASCADE` to `user.id` are also removed by the core delete.
- **Slug-dependent tests.** The export filename was asserted as `data-factory-template.json`, which fails in every product repo. Both the API test and the E2E test now derive it from the slug or a pattern.
- **First `/sync-template` into the dummy** found two more:
  - `packages/config`'s test asserted `slug === "factory-template"`. It now checks the slug format and that plans exist.
  - `new-product` renamed the Worker without regenerating `worker-configuration.d.ts`, so a new product's first `verify` failed the typecheck. The generator now runs `wrangler types`.
  - API and E2E tests hardcoded the template's plan ids and prices (149000 / 249000) and its Sentry DSN. They now read `product.config.ts` (`firstPlan` / `lastPlan` helpers), and `sentryOptions` takes an injectable DSN.
- **Not changed:** the example feature (`/example`) stays in products for now, because template E2E and API tests use it to exercise the paywall. A later template change should move those tests to a fixture route so products can delete the example cleanly (follow-up).

## D-029: CI needs a scoped API Token, never the Global API Key (2026-10-11)

- **What happened.** The Phase 8 dummy's preview failed four times with `Rate limited. Please wait… [code: 10429]` on its very first Cloudflare call (`GET /workers/services/<name>`). The account was nowhere near any limit: 218 / 100,000 requests that day. The template repo's CI, using its own token, worked throughout.
- **Cause.** The repo secret `CLOUDFLARE_API_TOKEN` held the **Global API Key**. CI sends the secret as a Bearer token, and Cloudflare answered with 10429, not an authentication error, so the message pointed the wrong way. A scoped API Token fixed it at once, and the Global API Key was rolled.
- **Rule.**
  - CI tokens are API Tokens from the "Edit Cloudflare Workers" template, plus Account → D1 → Edit, with Zone Resources set to All zones (no zones are used yet).
  - The Global API Key is never stored anywhere.
  - `/new-product` and SETUP_HUMAN say so.
  - When CI shows 10429 on the first call of a new repo, check the token before suspecting limits.

## D-030: Payment and reminder analytics come from the server (2026-10-11)

- **Problem.** The human's two sandbox payments never produced a `payment_paid` event. It was sent from the browser's return page, but only if that page was still open when the webhook confirmed, and users often close the tab or come back later.
- **Fix.**
  - `openPanelServer` (`@factory/core/analytics`) posts `{type: "track", payload: {name, profileId, properties}}` to OpenPanel's `/track` with the client secret. It applies the same name check and PII scrubbing as the browser, and never throws.
  - The webhook sends `payment_paid` when it grants access, and `payment_failed` when a payment ends unpaid. Properties are the plan, `amount_idr` and status; the profile is the opaque user id.
  - The cron sends `renewal_reminder_sent` (with `kind`) and `entitlement_expired`.
  - The browser no longer sends the payment events, so nothing is counted twice.
- **Secret.** The `OPENPANEL_CLIENT_SECRET` Worker secret is set on **production only**: previews never send. Without it, server analytics are a no-op.

## D-031: The app bundle no longer ships Zod (2026-10-11)

- **Measured** with a source-map attribution of the web entry bundle (2,031 KB raw / 494 KB gzip). **Zod was 26% (496 KB)**, more than React DOM. It was there only because `product.config.ts` validates itself with `defineProduct` (Zod), and every screen imports the config.
- **Fix.**
  - `pnpm theme` (`scripts/gen-theme.mjs`, already the "derived from product.config.ts" generator) also writes `apps/app/src/core/product.generated.json`: the validated config with defaults applied.
  - `apps/app/metro.config.js` resolves `product.config.ts` to that JSON for the app bundle. TypeScript still type-checks against `product.config.ts`.
  - `verify` runs `gen-theme --check`, so a stale JSON fails CI.
- **Result:** entry 1,490 KB raw / 394 KB gzip (−27% / −20%). The rest is framework (Expo Router 429 KB, React Native Web 276 KB, React DOM 175 KB).
- **Rule:** after any change to `product.config.ts`, run `pnpm theme`. CLAUDE.md is updated.

## D-032: Template tests don't depend on the home screen or the example feature (2026-10-11)

- **Problem (from the Phase 8 dummy).** Template E2E checked the home screen's "Masuk sebagai …" text and clicked "Buka fitur contoh (berbayar)". API tests called `/api/example`. A product that replaces its home screen or deletes the example (as `/build-from-spec` says) would break template-owned tests.
- **Fix.**
  - `e2e/tests/support.ts`: shared `signIn` and `expectAccess`, which read the session, missing consents and paid access from `/api/me` with the page's cookies. Asking the API about consent also removed a race: the app can pass through `/` before redirecting to `/consent`.
  - API tests use a test-only route `PAID = "/api/__test/paid"` (`test/helpers.ts`) behind the real `sessionMiddleware` + `requireAccess`.
  - `/build-from-spec` now tells products to replace the home screen and delete the example once a real paid feature exists.
- **Trade-off:** the Paywall UI is no longer driven by a template E2E. It is a small core component, and products' own E2E cover their paywalled screens (as the dummy's notes E2E did).

## D-033: Sell engine, Module 1: standard funnel events and first-touch attribution (2026-10-11)

- **Goal.** Every product can run a paid-ads funnel from day one: ad → lander → quiz → first result → paywall → checkout → purchase → renewal. Module 1 is the measurement layer the other modules build on.
- **One event set** in `@factory/core/analytics` (`FUNNEL_EVENTS`): `lp_view`, `cta_tap`, `quiz_start`, `quiz_step`, `quiz_complete`, `first_result`, `paywall_view`, `checkout_start`, `purchase`, `renewal`, `refund`.
  - They replace the older names that meant the same thing: `paywall_shown` → `paywall_view`, `checkout_started` → `checkout_start`, `payment_paid` → `purchase` (first paid payment of a user) or `renewal` (any later one). The site's pricing buttons now send `cta_tap`: a click on the site isn't a checkout yet.
  - `purchase`, `renewal` and `refund` come from the server only. `POST /api/events` accepts only `CLIENT_FUNNEL_EVENTS`, so a browser can't fake revenue.
- **Events go to two places.**
  - OpenPanel, as before (production only).
  - First-party D1 `funnel_events`, in every environment (each has its own D1). This is what `/admin`'s funnel and per-campaign numbers read (Module 6): no third-party API, and it works before any marketing consent, because rows hold only a random device id, the event, the campaign and an IDR value.
- **First-touch attribution.**
  - On a device's first visit, a "touch" is kept in `localStorage`: a random `anonId`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `fbclid`, landing path and time. Later visits never overwrite it.
  - The site and the app are different origins, so the site adds the touch to every link into the app (`aid`, `fst` and the UTM tags; `withTouch`). The app adopts the site's `anonId` and first-visit time, which keeps the fbclid's click time for Meta's `fbc` (Module 2).
  - The app captures the touch during its first render, before a child layout redirects to `/sign-in` and drops the query string.
  - After sign-in the app posts it to `POST /api/attribution`, once per device. `attributions` keeps one row per user, and the first one wins.
  - Checkout copies the user's attribution onto the payment (`payments.utm_*`, `fbclid`), so revenue joins to campaigns by `utm_campaign` without extra lookups.
- **Server events.** The webhook records `purchase` or `renewal` (D1 plus OpenPanel, with `utm_campaign`) when it grants access. `payment_failed` is unchanged.
- **Cost.** One small Worker request plus one D1 write per funnel step. At Rp100K/day of ads that is a few thousand rows a day, well inside the D1 and Workers free limits. The cron deletes funnel events after 400 days. `EVENTS_LIMITER` allows 300 batches per minute per IP, because mobile carriers put many users behind one IP.
- **The site's beacon** is a `sendBeacon` with a `text/plain` body. That is a "simple" cross-origin request: no CORS preflight and no cookie. The response is never read.
  - `/api/events` sends `Cross-Origin-Resource-Policy: cross-origin`; every other API route keeps `same-origin`. The first production Lighthouse run (2026-10-12) showed the browser blocking the beacon's empty response (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`, a console error). The request itself still reached the API, but that isn't guaranteed in every browser. The response is a 204 with no body, so there's nothing to leak.
- **UU PDP.**
  - The export includes the attribution and the funnel events.
  - Erasure deletes both (by user and by the device's `anonId`), and clears `fbclid` from the de-identified payment rows. The campaign name stays, so ad reporting keeps its totals.
- **Browser-safe split.** `@factory/core/attribution/touch` has no database imports, so the site and app bundles don't pull in Drizzle. `@factory/core/attribution` adds the D1 functions.

## D-034: Sell engine, Module 2: Meta Pixel and Conversions API, behind marketing consent (2026-10-11)

- **Off by default.** `product.config.ts` `marketing.metaPixelId` (public) turns it on. The CAPI token is a Worker secret (`META_CAPI_TOKEN`); `META_TEST_EVENT_CODE` is set only while testing in Events Manager. Like OpenPanel, the Pixel and CAPI run on production only.
- **UU PDP consent first.** With a Pixel ID, the site and the app show a banner with an "Izinkan pelacakan iklan (Meta)" toggle that starts off. No choice counts as no.
  - No consent means no Pixel script and no CAPI. Analytics stays first-party (OpenPanel plus D1 funnel events, D-033).
  - The site's choice rides into the app in the CTA link (`mc=1|0`), so the visitor isn't asked twice.
  - After sign-in the app records the choice once in `consents` (`marketing`, `POST /api/consents/marketing`). From then on the account's value wins, and the Akun page has a toggle to withdraw it.
- **Browser Pixel** for top-of-funnel events:

  | Funnel event | Meta event |
  |---|---|
  | `lp_view` | ViewContent |
  | `quiz_complete` | Lead |
  | `signup_completed` | CompleteRegistration |
  | `trial_started` | StartTrial |
  | `checkout_start` | InitiateCheckout |

  Other funnel steps stay first-party. Meta's base code runs as a function (`loadPixel`), not an inline script, because the CSP allows script files only. `https://connect.facebook.net` is allowed in `script-src` on the site and the app, and it is loaded only after consent.
- **Server CAPI for money events.**
  - `purchase` maps to Purchase. `renewal` maps to a custom "Renewal" event, so campaigns optimizing for Purchase learn only from new buyers.
  - Both are sent from the webhook after the provider confirmed the payment, never from the browser alone.
  - The payload follows Meta's docs (read 2026-10-11, Graph API v25.0):
    - `action_source: website`, `event_time` in seconds, and `custom_data` `{ value: <integer IDR>, currency: "IDR" }`;
    - `em` and `external_id` are the SHA-256 of the trimmed, lowercased email and of the user id;
    - `fbp`, `fbc`, `client_ip_address` and `client_user_agent` are sent unhashed.
- **Deduplication.** The return page fires the same event through the Pixel with `eventID` = the payment id, which is also the CAPI `event_id`. `GET /api/billing/status` says whether it was a purchase or a renewal; a purchase is a paid payment with no earlier paid one.
- **`fbc`** is the Pixel's `_fbc` cookie when present. Otherwise it is built from the stored first-touch `fbclid` and first-visit time (`fb.1.<ms>.<fbclid>`, case kept).
- **Checkout context.** The webhook has no browser, but Meta requires `client_user_agent` for website events. So checkout saves `payment_tracking` (user agent, IP, fbp/fbc, source URL), and only when CAPI is configured and the buyer has marketing consent.
  - The row is deleted when the event is sent, or by the cron after 7 days (CAPI accepts events up to 7 days old).
  - If consent was withdrawn before the webhook, nothing is sent and the row is dropped.
  - Account deletion removes it.
- **Failures never break payments.** `sendCapi` never throws, and it runs in `waitUntil`.
- **Docs.** The privacy template lists Meta as a processor, with consent as the legal basis. `SETUP_HUMAN.md` step 10 covers the Business portfolio, ad account, Pixel, token, test code and domain.

## D-035: Sell engine, Module 3: config-driven ad landers at /l/<slug> (2026-10-11)

- **One content file per campaign, no code.** Each lander is a file in `apps/site/src/content/landers/<slug>.md`, and the file name is the URL: `/l/<slug>/`. Its fields are validated at build time:
  - `hook`: the ad's hook, word for word. It is rendered as the page's `<h1>`, so the ad's promise and the lander can't drift apart ("scent").
  - `sub` (sub-copy) and `cta` (button label).
  - `description` (tab and share text).
  - `campaign`: the `utm_campaign` the ads use, for `/admin`.
  - Optional `proof`: a quote, up to 3 stats, or an image.
  - The Markdown body is for "how it works" below the fold.
- **One way forward.** The header shows only the logo, with no nav links. Both CTA buttons go to the app's `/quiz` (Module 4), and the site script adds the touch and the marketing choice to them (D-033, D-034). The page sends `lp_view`, the buttons send `cta_tap`.
- **Price framing under the CTA** comes from `product.config.ts`: "Mulai dari ≈ Rp…/minggu", the cheapest plan per week rounded to Rp100 (`@factory/core/pricing`, shared with the paywall), plus the payment methods and "tanpa tagihan otomatis".
- **Not for search.** Landers are `noindex` and left out of the sitemap: they exist for ads, and duplicate copy across campaigns would only dilute the SEO pages.
- **Fast on a mid-range Android over 4G (LCP target < 2.5 s).**
  - The page is static HTML plus one small CSS file and the shared site script (`async` module, not render-blocking).
  - It uses the system font stack, so there is no web font to fetch.
  - The LCP element is the text headline. The optional proof image sits below the fold: lazy, responsive `srcset` (400/800 px, WebP via `astro:assets`), with width and height set (no layout shift).
  - The Meta Pixel loads only after consent, and after first paint.
- An example lander ships at `/l/contoh/`. The site test checks the `<h1>`, the CTA target, `noindex`, the `lp_view` event, and the sitemap exclusion.

## D-036: Sell engine, Module 4: config-driven quiz onboarding (2026-10-11)

- **The product defines the quiz** in `apps/app/src/features/quiz.ts` (product-owned). The definition has an `id`, 5 to 8 steps, and an optional `summary(answers)` that returns message keys. Step kinds:

  | Kind | Answer |
  |---|---|
  | `single` | One option, which auto-advances |
  | `multi` | Options with an optional `max`, then "Lanjut" |
  | `number` | A number within `min`/`max`, with an optional unit |

  All strings are i18n keys in `features/messages.ts`. A template ships as an EXAMPLE. Setting `quiz = null` turns the quiz off, and `/quiz` then sends visitors to sign-in.
- **The engine is template-owned.**
  - `@factory/core/quiz` holds the pure rules: `quizProblems`, `isValidAnswer`, `cleanAnswers`, `firstOpenStep`, `recapAnswers`.
  - `apps/app/src/core/quiz/runner.tsx` is the UI: one step per screen, an accessible progress bar ("Langkah n dari N"), a back button that keeps answers, and 56 px tap targets.
  - `apps/app/test/quiz.test.ts` checks in every product repo that the product's quiz is well-formed and that every key is translated.
- **Saved locally first.** Answers go to `localStorage` after every step, so they survive reloads and the magic-link round trip. On native they are in memory until Phase 10.
- **Attached after signup.** The protected layout renders only after the required consents, including `sensitive_data` for products that need it. It then posts the completed answers to `POST /api/quiz`: one `quiz_responses` row per user and quiz, which a retake replaces.
  - The API validates shape only (at most 8 answers; values are short strings, lists or finite numbers), because the questions live in the app.
  - Product API features read the answers to personalize. The export includes them and erasure deletes them.
- **The summary comes before signup or the paywall.** "Rencana kamu siap" shows the product's plan lines plus a recap of the answers. Its CTA leads to sign-in ("Simpan rencanaku"); what happens after sign-in is the paywall placement (Module 5).
- **Events:** `quiz_start`, `quiz_step` (with `step`), `quiz_complete`. They go first-party and to OpenPanel; `quiz_complete` also goes to Meta as Lead, with consent.
- **The template E2E is product-independent.** It answers whatever quiz the product defines (first option, or the lowest valid number), checks back navigation and the summary, signs in, and checks that the answers are attached (D-032 lesson).

## D-037: Sell engine, Module 5: the first real result before the paywall (2026-10-11)

- **Config.** `product.config.ts` gets `funnel`:
  - `coreAction` (default `"core"`): the name of the one core action.
  - `freeUses` (default 1): free uses of that action per user.
  - `paywallPlacement`: `after_quiz`, `after_first_result` (the default) or `after_quota`.
- **The quota is enforced on the server.** `requireAccessOrFreeUse` goes on the route that performs the core action.
  - Paid access passes and spends nothing.
  - Otherwise one free use is spent with an atomic upsert in `free_usage`: the increment happens only while `used < limit`, and a test fires 10 concurrent calls at a limit of 3.
  - Once the uses run out, the route answers `402 { error: "payment_required", reason: "free_uses_used" }`.
  - `x-free-uses-left` and `/api/me` `freeUses` tell the app how many uses are left. Reads of saved results must not use this gate.
- **Placements.**

  | Placement | When the paywall appears |
  |---|---|
  | `after_quiz` | The quiz summary leads to sign-in, then straight to `/pricing` (a one-time "after sign-in" flag). Pair it with `freeUses: 0` for a hard paywall. |
  | `after_first_result` | The product calls `reportFirstResult()` (`first_result`, once per device) when it shows its first result, and renders `<UpgradePrompt />` under it: the offer plus how many free uses are left. |
  | `after_quota` | Nothing until the API's 402. Then `<Paywall reason="free_uses_used" />` appears ("Jatah gratis kamu sudah habis"). |

- **The paywall (`PlanCards`, used by `/pricing` and `UpgradePrompt`).**
  - Plans come from config, each with "≈ Rp…/minggu" (`@factory/core/pricing`, rounded to Rp100).
  - The highlighted plan is the configured one, or else the longest (the 12-month plan). It shows its saving against the next shorter plan bought repeatedly, e.g. "Hemat Rp49.000 (16%) dibanding 6 bulan".
  - The real payment methods from `payments.methods` are listed (QRIS, DANA, ShopeePay, OVO, Virtual Account).
  - The site's `/harga` uses the same framing.
  - `paywall_view` is sent with a `surface`: pricing, first_result, free_uses_used or paid_feature.
- **The example feature** now shows the pattern: `POST /api/example/run` sits behind `requireAccessOrFreeUse`, and the screen shows the result, reports the first result and renders the prompt. Template tests use test-only `CORE = "/api/__test/core"` instead (D-032).
- **UU PDP.** The free-use counters are erased with the account.

## D-038: Sell engine, Module 6: unit economics in /admin (2026-10-11)

- **Ad spend in.** The `ad_spend` table keeps one row per Jakarta day, channel and campaign; re-entering the same key replaces the amount. There are two inputs:
  - manual entry in `/admin`;
  - CSV import of a Meta Ads Manager export (`POST /api/admin/spend/import`, raw text body, up to 1 MB; every other route stays at 64 KB). The export needs **Breakdown → By time → Day**. English and Indonesian column names, comma or semicolon separators, and both number formats are accepted, and summary rows are skipped. A multi-day row is rejected with an explanation instead of being guessed.
  - `campaign` must equal the ads' `utm_campaign`: that is the join to buyers. Set it in Meta as `utm_campaign={{campaign.name}}`.
- **Future API sync.** The interface is the `AdSpendSource` (`fetchDaily(range)`) plus `syncSpend`, writing `source: "api"`. A Meta Marketing API sync isn't built: it needs app review and a long-lived token.
- **Numbers out** (`GET /api/admin/economics?from&to&campaign`, pure functions in `@factory/core/economics/metrics`, unit-tested). The cohort is the users first seen in the range: the attribution's first visit, else signup.

  | Metric | Definition |
  |---|---|
  | CAC | Spend divided by cohort users who bought. Null when no spend was entered, rather than a misleading 0. |
  | ROAS D7 / D30 | Revenue within 7 / 30 days of the first visit, divided by spend. |
  | AOV | Average paid order of the cohort's buyers. |
  | Renewal rate | Of buyers whose first paid period has ended, the share who bought again. |
  | Estimated LTV | AOV / (1 − renewal rate), with the rate capped at 0.9 so tiny samples don't explode. |
  | LTV − CAC | LTV minus CAC. |

  - Totals are blended: all spend over all new buyers, organic included. Per-campaign rows join on `utm_campaign`, and a "(tanpa kampanye)" row shows organic buyers.
- **Funnel.** The view counts distinct visitors per step (`FUNNEL_STEPS`; `first_result` drops out for `after_quiz`) and the conversion from the previous step.
  - It is sequential: a visitor counts at a step only if they also reached the step before. Without that, visitors who enter midway (straight to `/pricing`, an organic sign-up) pushed rates above 100% in the first local run.
  - Benchmarks are configurable (`product.config.ts` `economics.benchmarks`). The defaults are a starting point, not truth.
  - The first step below its benchmark is flagged red: that is the layer to fix first (`/funnel-diagnose`).
- **Target CAC calculator.**
  - Breakeven CAC = price × (1 − payment fee) / (1 + ad tax). Target CAC = breakeven × `targetCacFactor`.
  - Defaults: fee 2%, ad tax 11% (Meta's VAT in Indonesia), factor 0.9.
  - The admin can change the fee and tax per plan in the UI. The calculator also shows the same numbers for the estimated LTV.
- **Refunds.** `POST /api/admin/refund` is used after refunding in the provider's dashboard.
  - It sets the payment to `refunded`, ends the access the payment granted now, and records the `refund` event (first-party plus OpenPanel). Refunded payments drop out of revenue. It is idempotent.
  - In the UI it is a two-tap confirm.

## D-039: Sell engine, Module 7: playbooks for specs, ads and diagnosis (2026-10-11)

- **Six new skills in `.claude/skills/`**, in the same format as the existing ones: a `SKILL.md` with `name`, `description`, `argument-hint` and `disable-model-invocation: true`, so they run only when the human types them.

  | Skill | What it does |
  |---|---|
  | `/spec-interview` | Asks one question per message, in order: who, problem, core loop, first 30 seconds, "aha", why they come back tomorrow, what they pay for, kill criteria. Pushes back when the scope is more than one core loop, writes `specs/<slug>.md`, and runs `spec-check`. |
  | `/ad-hooks` | 10 hooks with the formula, two each of: skeptic flip, before → after, name the pain, teach one thing, a push. Each is checked against Meta's standards and the product guardrails, and mapped to a lander `hook`. |
  | `/creative-brief` | One shootable 9:16 brief: who and where, scenes S1–S4 with timings, the CTA with the UTM template, rules, the safe zone. |
  | `/ad-test-plan` | Rp100K/day, one ad per test, a first read at 3,000 impressions. Kill at 2× target CAC with zero sales. Promote after at least 3 purchases over at least 3 days with CAC at or under target and ROAS D7 at least 1.75. Tracking is verified before any spend. |
  | `/funnel-diagnose` | Checks tracking first, then finds the first step below its benchmark (what `/admin` marks red) and maps it to one layer: creative, lander scent, onboarding, offer, or tracking. |
  | `/explain` | Five answers from the actual diff: what it does, the path from screen to database, the changed files, the proof, the likeliest failure. Ends with a recommendation. |

- **`/hooks` became `/ad-hooks`.** `/hooks` is a built-in Claude Code command (hook settings), and a skill can't reliably take its name.
- **The spec template has a "Core loop & funnel" section** (core loop, first 30 seconds, "aha", why users return, quiz, free uses and paywall placement, first hooks). It is optional for `spec-check`, so old specs stay valid, and `/spec-interview` fills it. `/build-from-spec` now covers the sell-engine steps: quiz, `requireAccessOrFreeUse`, `reportFirstResult` with `UpgradePrompt`, and landers.

## D-040: Sell engine, Module 8: ad and lander guardrails in CLAUDE.md (2026-10-11)

- **The new section "Ads and landers"** sits in `CLAUDE.md`, next to the product guardrails, so every agent session in every product repo reads it. It says:
  - Meta Advertising Standards apply, and the agent reads the current version before writing ad copy.
  - Health, fitness and food products: no before/after bodies, no weight-loss claims or timelines, no body shaming, no medical claims.
  - No personal attributes asserted about the viewer.
  - Promise only what the product does in its first session.
  - Scent: the lander's `hook` repeats the ad's hook word for word, and they change together.
  - Tracking only with consent, and only through `@factory/core/meta`.
  - Money events from the server only.
- **The playbooks enforce it.** `/ad-hooks`, `/creative-brief` and `/ad-test-plan` check these rules, and the lander schema makes the hook the headline (D-035).
- **Why in CLAUDE.md, not only in skills:** ads also get written outside the playbooks (a quick landing tweak, a new SEO page, a reply to "bikin caption iklan"), and `CLAUDE.md` is always loaded. Meta rejects or restricts ads and accounts that break these standards, which would stop a product's only acquisition channel.

## D-041: Dependency audit follow-up (2026-10-12)

- **`sharp` 0.35.5** is now an override in `pnpm-workspace.yaml` (GHSA-wq5f-xc86-pv6w). It is the same minor and passed the 14-day rule today. Astro uses it for build-time images, and miniflare uses it in dev and tests. It is not in the Worker runtime.
- **Still waiting under the 14-day rule:**

  | Package | Version | Eligible from |
  |---|---|---|
  | source-map-js | 1.2.2 | 2026-10-14 |
  | shell-quote | 1.11 | 2026-10-16 |
  | http-cache-semantics | 4.3.0 | 2026-10-18 |

- **The full audit (dev included)** also lists the advisories below. All are dev/build tooling, none in the Worker runtime, and none has a same-major fix that is eligible today, so they stay with their upstreams:

  | Package | Where it comes from | Fix status |
  |---|---|---|
  | `undici` 7.29.0 | wrangler/miniflare | The 7.29.1 fix isn't published yet |
  | `uuid` 7.x | Expo tooling | Fix needs a major bump |
  | `postcss-selector-parser` 6.x | Tailwind 3 | Fix needs a major bump |
  | `braces` | build tooling | No fix released |
  | `node-forge` | build tooling | No fix released |
  | `decode-uri-component` | build tooling | Fix needs a major bump |
  | `esbuild` | drizzle-kit | Fix needs a major bump |

  They are re-checked when the upstream packages update.

## D-042: Anonymous free uses: the first result before signup ("pay for proof") (2026-10-12)

- **Why.** Alif Academy's onboarding module (Model B, "Pay for proof") shows one real result before asking for anything. Our free uses (D-037) only worked after sign-in, and the magic-link round trip before the first result is where visitors drop off. Myna Fit's meal scan is the first product that needs this.
- **Config.** `funnel.anonymousFreeUses` (default 0, so it's off and nothing changes for existing products) must be at most `freeUses`, because the anonymous uses count toward the account's after signup. `funnel.anonymousPerIpPerDay` defaults to 20. It's generous on purpose: mobile carriers in Indonesia put many people behind one IP.
- **Server-enforced, two keys** (`free_usage`, no new table):
  - The device's random `anonId` (D-033). The app sends it as `x-anon-id` on every API call. It's random, so it isn't personal data.
  - The IP per Jakarta day, stored as `ip:` plus a SHA-256 of IP + secret. No raw IP is stored. If the IP cap refuses a request, the device's use is given back.
  - Private windows and new devices therefore can't farm free scans past the IP cap. The cron drops the IP rows after 2 days.
- **`freeUseGate(options)`.** `requireAccessOrFreeUse` is this gate with the product's config. Tests use explicit limits (`CORE_ANON`).
  - A visitor without a session spends an anonymous use; when none is left (or there's no device id) the answer is `401 { error: "sign_up_required" }`.
  - A signed-in user behaves as before: free uses, then `402 free_uses_used`.
- **At signup** the app posts the touch (`POST /api/attribution`, now once per device *and account*, so a second account on the same device is attached too).
  - `claimAnonymousUses` adds the device's uses to the account, capped at `freeUses`, and removes the device row, so signing up can't double the free uses.
  - The product-owned hook `claimAnonymousData(db, userId, anonId)` moves the visitor's results (e.g. their first meal scan) to the account.
- **App.** `<UpgradePrompt />` asks a visitor to "Simpan hasil & lanjut". It sets the after-sign-in target to `/pricing`, so the plans come right after the sign-in. `/api/me` reports a visitor's anonymous free uses.
- **Cost note.** A vision-model scan costs about Rp20 (Myna Fit's own measurement). The IP cap bounds abuse at roughly Rp400 per IP per day at the default.

## D-043: Consent before signup and a public entry screen for "pay for proof" (2026-10-12)

- **Why.** D-042 lets a visitor use the core action before signing up, but two pieces were missing. Myna Fit's migration found both (`specs/myna-fit.migration.md`, GAP-4 and GAP-5):
  - **No consent before processing.** Consents were recorded only for accounts. A health product processes data first (the quiz asks weight, height and age; the scan sends a photo to an AI provider abroad), and UU PDP needs explicit consent before that.
  - **No public screen.** The quiz always sent a visitor to sign-in, and product screens lived in the session-only `(app)` group.
- **Consent per device.**
  - `POST /api/anonymous-consents` records the required documents (terms, privacy, and `sensitive_data` when the product needs it) under `anon:<anonId>`. It reuses the `consents` table and needs no migration (its `user_id` has no foreign key). It's rate-limited per IP like the events beacon.
  - `freeUseGate` takes `consents`. `requireAccessOrFreeUse` passes the product's required consents, so an anonymous use without them is 403 `{ error: "consent_required", missing }`, checked before a use is spent.
  - `/api/me` reports a visitor's missing consents (with a device id) and, once signed in, moves the device's consents to the account (`claimAnonymousConsents`). They keep their original time, so the record shows when consent was given, and the account isn't asked again on `/consent`.
  - Unclaimed visitor consents are dropped after `ANONYMOUS_CONSENT_DAYS` (90) by the cron. Products delete a visitor's unclaimed results by then too.
- **Public entry.**
  - `funnel.anonymousEntry` is the app path of the product's public screen (e.g. `/scan`). It's required when `anonymousFreeUses > 0`, and the config refuses it otherwise.
  - The quiz then shows `<AnonymousConsentGate>` before the questions, and on completion leads a visitor to that screen instead of to sign-in. Without a quiz, `/quiz` redirects there.
  - The product's route file is a thin re-export outside `(app)`; `CLAUDE.md`'s ownership table now names such files product-owned.
- **Unchanged for existing products.** `anonymousFreeUses` defaults to 0 and `anonymousEntry` to null, so no gate is shown and the quiz still leads to sign-in.

## D-044: Upload routes get their own body limit (2026-10-12)

- **Why.** Every `/api/*` route took at most 64 KB, and the only exception (the ad-spend CSV) was hardcoded. A meal photo resized on the device to 1024 px JPEG is about 150–300 KB, so Myna Fit's scan couldn't be built without editing core (`specs/myna-fit.migration.md`, GAP-2).
- **How.**
  - `apps/api/src/features/uploads.ts` (product-owned) lists larger limits by exact path, e.g. `{ "/api/scan": 2 * 1024 * 1024 }`.
  - Core's `apiBodyLimit` applies them and caps any entry at 5 MB. Unlisted paths keep 64 KB, and the CSV import keeps its 1 MB.
- **Reading the file.**
  - `readImageUpload(c)` takes one multipart field and decides JPEG, PNG or WebP from the file's first bytes, never from the type the client claims.
  - Multipart, not base64 JSON: no 33% inflation, and React Native's `FormData` sends files natively.
  - HEIC is refused; apps convert to JPEG before sending (`expo-image-manipulator`).

## D-045: AI provider adapter with cost caps and a usage log (2026-10-12)

- **Why.** Myna Fit's meal scan calls a vision model. The template had no way to call a model, keep its key, cap its cost or log its use (`specs/myna-fit.migration.md`, GAP-1). Building that in the product would put provider code and secrets handling outside core.
- **Adapter** (`@factory/core/ai`): one call, `json({ system, text, image?, schema, maxOutputTokens })`, returns a parsed JSON answer or a typed failure (`quota`, `rate_limited`, `unavailable`, `bad_request`, `bad_output`, `refused`). It never throws.
  - **OpenAI** uses the Responses API, read from the current docs on 2026-10-12:
    - strict `json_schema` output;
    - the image as a data URL;
    - `store: false`, so the photo and answer aren't kept as a stored response;
    - `service_tier: "fast"` for Fast mode (reported back as `priority`).
  - **The mock** answers from a product function: local dev, tests, E2E and previews, at no cost.
- **Which provider.** `aiProvider(env, mock)`:
  - OpenAI when `OPENAI_API_KEY` is set;
  - the mock without a key in development, test and preview;
  - **nothing in production without a key**, so the route answers 503 instead of fake results in front of paying users.
  - `product.config.ts` `ai` holds the model and tier; the `AI_MODEL` var can override the model.
- **Cost.** List prices per model (standard tier; Fast is exactly twice) live in `OPENAI_PRICES`.
  - Every call is logged in the new core table `ai_usage` (account or `anon:<anonId>`, feature, model, tier, outcome, latency, tokens, cost in micro-USD). Failed calls are logged too and count toward the caps.
  - Check: a measured Myna Fit scan (1,680 in / 885 out on gpt-6-luna) costs 611 micro-USD standard and 1,221 Fast, before PPN.
- **Caps.** `requireAiBudget` (the product's `ai.perUserPerDay` and `ai.anonymousPerDay`) goes **before** `requireAccessOrFreeUse`, so a refused call spends no free use:
  - 429 `ai_limit` per account or device per 24 h;
  - 429 `ai_busy` once all visitors together reach the daily budget.
- **Privacy.**
  - Visitors' rows move to the account at signup (with the free uses), and unclaimed ones are dropped after 90 days by the cron.
  - An account's rows are in the UU PDP export and are deleted with the account.
- **Human step:** one OpenAI project per product with a monthly budget limit, and its key as a Wrangler secret (`SETUP_HUMAN.md` step 11).

## D-046: The product's own scheduled jobs (2026-10-12)

- **Why.** Products promise retention in their privacy policy (Myna Fit: delete visitors' unclaimed scans, and data 24 months after a plan lapses, with an email first), but only core's cron existed (`specs/myna-fit.migration.md`, GAP-6).
- **How.** `apps/api/src/features/scheduled.ts` (product-owned) exports `runProductScheduled(env, now)`. Core's cron calls it after its own jobs, every 30 minutes.
  - A throw is logged and reported to Sentry, and core's results still return.
  - Daily jobs check `now` themselves. The template's version does nothing.

## D-047: Products may add dependencies (2026-10-12)

- **Why.** Feature code needs packages the template doesn't have; Myna Fit needs `expo-image-picker`, `expo-image-manipulator`, `expo-haptics`, `expo-keep-awake`, `expo-audio` and a chart library. `package.json` ownership was undefined (GAP-7).
- **Rule.**
  - A product may add `dependencies` to `apps/app` and `apps/api` for its features, chosen like any dependency: ≥ 14 days old, pinned, recorded in the product's `docs/DECISIONS.md`. Expo-managed packages are added with `expo install`, so they match the Expo SDK.
  - It never changes the template's versions, scripts or other fields. Those come from the template on every sync.
- **Sync.** `docs/TEMPLATE_SYNC.md` resolves `package.json` dependency conflicts as "both": the template's versions plus the product's additions. Then `pnpm install` regenerates the lockfile.

## D-048: Product navigation: bottom tabs on phones, top bar on wide screens (2026-10-12)

- **Why.** The signed-in shell's top bar was hardcoded to Beranda / Akun / Admin. Myna Fit has four main screens (Beranda, Nutrisi, Gym, Profil) used one-handed at the gym (`specs/myna-fit.migration.md`, GAP-8).
- **How.** `apps/app/src/features/nav.ts` (product-owned) lists up to 4 tabs: path, label key, optional icon. Core always adds Akun (unless the product links `/account` itself) and Admin for admins.
  - **Phones and native** (narrower than 768 px): a bottom tab bar with 56 px targets above the home indicator (safe-area inset). Icons are tinted with the theme's real colours, because native SVG can't read CSS variables.
  - **Wide web:** the top bar with the same tabs.
  - **Without product tabs:** the template's top bar everywhere, unchanged.
- **Checked** in the browser with two temporary tabs: the bottom bar at 375 px, switching tabs, content scrolling above the bar, and the top bar at 1280 px. A test checks every product's tab list (`tabProblems`).

## D-049: Users' files in R2, owned through a core table (2026-10-12)

- **Why.** Myna Fit keeps a 160 px thumbnail per meal. Lovable stored them as data URLs in the row, which would fill D1 (about 15 MB per active user per year; 10 GB per database). The template had no object storage (`specs/myna-fit.migration.md`, GAP-3).
- **How.**
  - **Storage:** every product gets an R2 bucket per environment, bound as `FILES` (`<slug>-files`, `<slug>-files-preview`). `/new-product` creates them next to the D1 databases.
  - **Ownership:** the bytes live under the opaque key `f/<id>`. The core table `files` records the owner (an account or `anon:<anonId>`), feature, type and size.
  - **Moving to an account:** a visitor's file moves to the account at signup by updating its row. No object is copied.
  - **Product API:** `saveFile` returns the id the product keeps in its own row; `deleteFile` deletes only for the owner.
  - **Access:** `GET /api/files/:id` serves the owner only (session or device id). It sends `private, immutable` caching and `nosniff`, and answers 404 for everyone else, so ids aren't confirmed to strangers.
- **UU PDP.**
  - The account's files are listed in the export (each downloadable) and deleted from R2 and D1 with the account.
  - Visitors' unclaimed files are dropped after 90 days by the cron, like their consent and AI log.
- **Images aren't resized on the server** (Workers have no image library, and Cloudflare Images costs extra). Apps upload the small version they want stored.
- **Human, once per Cloudflare account:** enable R2 (`SETUP_HUMAN.md` step 2b). After that the agent creates the template's buckets and every product's.

## D-050: AI caps per feature (2026-10-12)

- **Why.** `requireAiBudget` counted all of a user's AI calls together. Myna Fit has photo scans (a vision call, 20 a day in its S&K) and typed meal text (much cheaper). With one cap, either scans weren't limited to 20 or text parsing stopped at 20 too. Found while creating `erdiprtm/myna-fit`.
- **How.**
  - `aiCallsSince(db, userId, since, feature?)` counts one feature when given. The existing `(user_id, created_at)` index already narrows to one user's last 24 h, so there is no new index or migration.
  - `aiBudgetGate` takes an optional `feature` with `featurePerUserPerDay`. The type makes them come together.
  - `requireAiBudgetFor(feature, perDay)` is `requireAiBudget` plus that feature's cap, and answers 503 for a product without AI.
- **The shared cap stays.** `ai.perUserPerDay` still caps all features together, so a product sets it to the total it allows (Myna Fit: 20 scans plus the text allowance). The anonymous budget stays global too.
- **Same answer.** A feature cap answers the same 429 `ai_limit`. The app knows which route it called, so it can say "scan habis hari ini, ketik manual saja".
- **The name must match** the `feature` the route passes to `runAi`, since the cap counts the log rows `runAi` writes.

## D-051: E2E starts its own server on :8788 (2026-10-12)

- **Problem.** On the Mac, local `pnpm e2e` often stopped with "Timed out waiting 120000ms from config.webServer", while a `wrangler dev` started by hand was Ready in seconds.
- **Root cause, reproduced.**
  - Another process held :8787, here another project's dev server answering 404 on `/api/health`.
  - `wrangler dev --port 8787` still says Ready, because workerd binds 127.0.0.1 and ::1 next to the other process's wildcard socket.
  - Playwright's health check uses Node's keep-alive agent. Its first poll reached the other server, so every later poll reused that socket and got 404 until the timeout.
  - With a 404 server on a spare port, real Playwright timed out; with the port free, the same run passed in 3 s. Start-up isn't slow, so a longer timeout wouldn't help.
  - The log only *looked* cut off after the cron warning: Playwright shows the server's stderr, not its stdout (where "Starting local server" and "Ready" go).
- **Fix.**
  - E2E runs its own `wrangler dev` on **:8788**, so it never meets `pnpm dev` on :8787.
  - `reuseExistingServer: false`: a stale `wrangler dev` has old code or other vars (for example no `ADMIN_EMAILS`), and reusing one silently made E2E fail.
  - `scripts/port-free.mjs` stops the run within a second, with an `lsof` hint, when anything already listens on :8788.
  - `DEBUG=pw:webserver pnpm e2e` shows the server's log (`CLAUDE.md`).
- **Ruled out:** stdin or TTY handling, wrangler's AI-agent notice, telemetry or update checks, and the R2 binding. Started the way Playwright starts it (shell, detached, stdin an open pipe), with all of these present, wrangler was Ready in about 6 s.

## D-052: Products get fuller design tokens (2026-10-13)

- **Problem (from Myna Fit).** Every product needs its own look. A product could only change colors, one radius and a font name, and the font name wasn't even used. Component shapes were fixed, and products may not edit `packages/ui` or `core/`.
- **The new tokens in `brand.tokens`** are all optional; unset gives exactly today's look.

  | Token | Values | Default |
  |---|---|---|
  | `radii` | `card`, `button`, `chip`, `input`, `sheet` (CSS lengths) | Each equals `radius`, except `chip`, which stays a pill |
  | `controlHeight` | Button and input height in px, 44–72 | 48 (`3rem`), like `h-12` |
  | `shadow` | Card shadow: `none`, `soft` (`shadow-sm`), `lift` (`shadow-md`) | `none` |
  | `density` | `compact` (tighter cards and screens) or `regular` | `regular` |
  | `weights.heading` | `medium` to `extrabold` | h1 bold, h2/h3 semibold |
  | `weights.body` | `normal` or `medium` | `normal` |
  | `fonts` | Bundled files (at most 6) | none |

- **How it reaches the components.**
  - Radii and control height are CSS variables written by `scripts/gen-theme.mjs` (`--radius-card`, `--control-height`, …), with literal values because NativeWind resolves one level of `var()` on native. Tailwind maps them to `rounded-card/button/input/chip/sheet` and `h-control`.
  - Shadow, density, weights and fonts are classes chosen by pure functions in `@factory/ui` (`lib/classes.ts`), from tokens the root layout passes in `UiThemeProvider`.
  - Without a provider the components use `defaultTokens`, so nothing changes for anyone who doesn't opt in.
- **Fonts without Google.** `fonts: [{ family, file, weight }]` names files in `apps/app/assets/fonts/` and `apps/site/public/fonts/` (both product-owned). The schema requires `fontFamily.sans` and `heading` to name listed families once any font is bundled.
  - App (web and native): `gen-theme` writes `apps/app/src/core/fonts.generated.ts` (static `require`s for Metro), the root layout loads them with `expo-font` (SDK 57's `57.0.4`), and Tailwind's `font-sans` / `font-heading` name those families.
  - Site: `gen-theme` writes self-hosted `@font-face` rules and `--font-sans` / `--font-heading` into `tokens.css`.
  - No font: no `useFonts` call, nothing waits, nothing flashes.
- **Tests.** The schema rejects bad lengths, heights under 44 or fractional, unknown enums, path-like or non-font file names, and families that aren't bundled. `gen-theme` writes the new variables (defaults equal the old values) plus the fonts. A snapshot pins the default classes. `@factory/ui` now has its own Vitest suite.
- **Sync.** The generated files are regenerated with `pnpm theme` after a sync (`docs/TEMPLATE_SYNC.md`). Font files belong to the product.

## D-053: Products restyle components with variants in features/theme.ts (2026-10-13)

- **Problem.** Tokens (D-052) cover sizes, radii, shadow and fonts. Shapes and styles that aren't tokens still lived only in `packages/ui`, which products may not edit. Example: a primary button that is `rounded-2xl h-14 font-bold` while the outline button stays standard.
- **Decision.** The product-owned `apps/app/src/features/theme.ts` exports `variants: UiVariants`:
  - `button`: `base`, per `variant` (default/secondary/outline/ghost/destructive/link), per `size`, and the label (`text`) per variant;
  - `card`, `badge`, `input`;
  - `text`, per variant (h1/h2/h3/lead/muted/small/default).

  The root layout passes it to `UiThemeProvider` next to the tokens. Each class function in `@factory/ui` merges the product's classes **last** with `cn()`, so a product class replaces the default it conflicts with and adds the rest. The template's file is empty.
- **`cn()` knows the token utilities.** `tailwind-merge` is extended with the radius names (`card`, `button`, `input`, `chip`, `sheet`) and the `control` size. Without that, `rounded-2xl` wouldn't replace `rounded-button`: both classes would stay and CSS order would decide. This is also part of D-052's PR.
- **Tailwind sees the product's classes.** `features/theme.ts` sits under `apps/app/src/**`, which the content scan already covers, so its classes compile on web and native.
- **Tests (`@factory/ui`).**
  - A product makes the primary button `rounded-2xl h-14` with a `font-bold` label, without touching `packages/ui`.
  - Overrides apply only to the variant and size they name.
  - Cards, badges, inputs and headings restyle.
  - Empty variants change nothing.

## D-054: Display slots for core screens (2026-10-13)

- **Problem.** Tokens and variants (D-052, D-053) restyle components, but core screens keep their layout: the quiz, sign-in, consent, pricing, tab bar and Akun header. Myna Fit wants its quiz as chat bubbles with a stepper for numbers (P-004), and its own headers. Products may not edit `core/` or core route files.
- **Decision: display slots, logic stays in core.**
  - `apps/app/src/core/slots.ts` defines `CoreSlots`. The product-owned `apps/app/src/features/slots.tsx` fills it, and the template's is empty.
  - A core screen renders the slot if it's filled, otherwise its default. A slot only gets finished, display-ready props.

  | Slot | Replaces | Props |
  |---|---|---|
  | `quizStep` | One quiz step | `step`, `value`, `onAnswer`, `back`, `progress`, `t` |
  | `quizSummaryHeader` | The "Rencana kamu siap" header | Display text |
  | `signInHeader` | The sign-in header | Display text |
  | `consentHeader` | Header on `/consent` and the pre-signup gate | Display text, plus `where` |
  | `pricingIntro` | The `/pricing` intro | Display text |
  | `planCard` | One plan (`/pricing`, UpgradePrompt) | Formatted price, per week, saving, `onBuy`, `busy` |
  | `tabItem` | One bottom tab's content | `label`, `active`, `Icon`, theme `colors` |
  | `tabBarClassName` | Extra classes for the bar | (a class string) |
  | `accountHeader` | The Akun header | Display text, plus product name and logo |

- **Hard rules in code (and tests).**
  - **Consent (UU PDP).** `/consent` and the pre-signup gate now share `ConsentForm`. The `consentHeader` slot replaces only the title and subtitle. The checkboxes, their legal text and the accept button are core's.
    - The button is `disabled={!canAccept(needed, checked)}`, and `submit` checks `canAccept` again.
    - `canAccept` (pure, tested) is false until every required consent is checked, and false for an empty list.
    - The header slot's props have no submit, checkbox or accept handle; a type-level test pins this.
  - **Quiz.** `answer()` drops any answer that fails `isValidAnswer` before it's stored, so a custom step can't skip a step or store bad data.
  - **Prices.** `PlanCards` returns nothing unless `showsWebPrices(Platform.OS)` (web only, tested for every native OS), whatever `planCard` renders. The slot gets prices formatted from `product.config.ts` and a checkout callback; it can't set a price.
  - **Access.** `requireAccess` and the free-use gate are on the API, and slots run in the app, so a slot can't reach them.
  - **Tab bar.** Core keeps the press target, `role="tab"`, selection state and navigation; `tabItem` draws the inside only.
- **Tests.** `apps/app/test/slots.test.tsx` runs in every product repo:
  - a minimal custom slot set that type-checks;
  - the consent rule and the shape of the header slot's props;
  - quiz answer validation;
  - no web prices on native.

  The template has no React Native render-test setup, so the consent button's disabled state is proven by the shared form's structure plus the pure rule, not by rendering a slot. Template E2E runs with the default (empty) slots.

## D-055: Template gaps found in Myna Fit: consent completion, trial-aware copy, config-following tests (2026-10-13)

- **Consent completion.** `/consent` sends only the documents still missing, for example `sensitive_data` for an account created before a product turned it on. `POST /api/consents` used to demand every required document in the request, so those users were stuck. It now checks the recorded consents **plus** the accepted ones and refuses only if that set is still incomplete (`missingRequired` lists what's left). `POST /api/anonymous-consents` follows the same rule and records only what was accepted.
- **Trial-aware paywall copy.** `paywall.body` says "Mulai coba gratis". Products without a trial now get `paywall.bodyNoTrial` (`paywallBodyKey(product.trial.enabled)`).
- **Template tests follow the product's config,** taken from Myna Fit, where they were made generic (D-028 / D-032 lesson):
  - API `startTrial()`: the trial endpoint when the product has a trial, else a direct trial entitlement.
  - Consent counts and lists come from `requiredConsents(config.legal)`.
  - The trial-only tests are skipped without a trial, and a "trial is closed" test replaces them.
  - E2E: `navItem()` matches a top-bar link or a bottom tab (D-048), and the consent screen ticks every box shown.
  - The quiz E2E knows "pay for proof".
  - The access-expiry test buys instead of starting a trial when there's none.
  - The site test checks the product's first lander instead of `contoh`.
- **Lander hooks may run to 160 characters** (was 120). Myna Fit's formula hooks need about 124.
- Not taken now (noted in Myna Fit's STATUS): "spend a free use only on success" (Myna Fit's P-005), persistent native storage (Phase 10), and the `blob:` CSP note.

## D-056: A free use can be spent only on success (2026-10-13)

- **Problem (Myna Fit P-005).** `requireAccessOrFreeUse` spends the free use before the handler runs. A blurry or non-food photo used up a visitor's only free scan and showed "sign up" instead of the first result. Myna Fit worked around it with its own read-only pre-check.
- **Decision.**
  - `freeUseGate({ ..., spend: "on_success" })`, with `checkAccessOrFreeUse` as the product's ready-made gate, runs the same checks as before: access, device consent (D-043), free uses left per account or device, and the IP's daily cap. It spends nothing.
  - The handler calls `spendFreeUse(c)` once it has a real result:
    - `null` means "send it";
    - a response means "send this instead", the same 401 `sign_up_required` or 402 `free_uses_used` as before.
  - The spend uses the same atomic upserts (D-037, D-042), so when concurrent requests race for the last free use, exactly one gets the result.
  - Paid access never spends.
  - The default stays `on_request`, so existing products behave the same.
- **Cost.** Failed attempts don't spend a free use, but each still costs the AI call. The AI budget caps (`requireAiBudget(For)`, D-045/D-050) still bound them, and the route should put that cap before the gate.
- **Tests.**
  - Failed attempts keep the free use; the first real result spends it.
  - Six concurrent requests: one gets the result, five get 401.
  - A signed-in user spends one per result, then gets 402.
  - Paid access spends nothing.
  - The device's consent is still required.

## D-057: Bundled fonts with several weights per family (2026-10-13)

- **Problem (Myna Fit feedback 1).** `fonts.generated.ts` keyed fonts by family, so a second weight of the same family was a duplicate object key (TS1117). A product could bundle one weight, and browsers faked bold from the regular file. Myna Fit stayed on the system font.
- **Decision.**
  - **Config.** `fonts` may list one family several times with different `weight`s, up to 12 files. The same family and weight twice is rejected.
  - **App, web and native.** Each file is registered with expo-font as `"<family>_<weight>"`, because native platforms pick a font by file, not by `font-weight`. The Tailwind config builds a class per role and bundled weight (`font-sans-400`, `font-heading-800`, …) and safelists them, since they come from config.
  - **`@factory/ui`.** It knows each text's weight: h1 bold, h2/h3 semibold, body normal, labels and badges semibold, all after `weights` overrides. `fontClass()` picks the nearest bundled file, and a tie goes to the heavier file. `UiTokens.fonts` is now the bundled weights per role, or `false`.
  - **Site.** Unchanged: one family with an `@font-face` per weight, so CSS `font-weight` picks the right face.
- **Correction to D-052.** Only `.ttf` and `.otf` are allowed now. Metro (and expo-font on native) can't load `.woff`/`.woff2`: the first build with a `.woff` failed with "Unable to resolve module". The site serves the same files.
- **Checked in a real build.** With a temporary two-weight config (a 400 and a 900 file), the web build's `<h1>` computed to `Arial_900`, the body to `Arial_400`, and both faces were `loaded`. The config was reverted afterwards. Native isn't checked yet; that's the Expo Go check in the product.
- **Tests.**
  - The config accepts 5 weights of one family and rejects a duplicate and a `.woff2`.
  - The generator writes 5 distinct keys (snapshot, no duplicate keys), and the site writes 5 faces.
  - `@factory/ui` uses the real ExtraBold for headings, the regular file for body text, and the nearest weight as a fallback.
  - The default classes snapshot is unchanged (no fonts means the platform font).
- **Note for products.** A product variant class like `font-extrabold` on its own changes only the weight. On native, also add the matching `font-sans-800`, or use the `weights` tokens, which pick the file automatically.

## D-058: Render tests for app components, and slot follow-ups (2026-10-13)

- **Render tests (Myna Fit feedback 5).**
  - `apps/app` tests run in jsdom, with `react-native` aliased to `react-native-web` (resolved from `apps/app`, since `packages/ui` doesn't depend on it) and `react-native-svg` stubbed. They use `@testing-library/react` 16.3.3 and `jsdom` 30.1.1, both published at least 14 days before.
  - Metro's web extensions come first, so `*.web.ts(x)` files resolve as in the web build.
  - Styles aren't under test (no NativeWind transform); behavior, roles and states are.
  - A product's `slots.tsx` that imports React Native components now loads in the template tests. Myna Fit's `require()`-at-render workaround can go.
- **The consent rule is now proven by rendering** (D-054 noted it wasn't). `ConsentForm` renders with a product `consentHeader` slot (mocked): the slot shows, core's three checkboxes are there, the accept button is `aria-disabled` and pressing it does nothing until all three are checked, and then it accepts once.
- **Slot follow-ups (Myna Fit feedback 4).**

  | Change | Detail |
  |---|---|
  | `quizSummaryBody` slot | Gets the translated plan lines and the answer recap. The "next" and "back" buttons stay core's. |
  | Default summary card | Lost the stray `pt-6` top gap. |
  | Numbers in the recap | Formatted for the locale with `formatNumber`: "71,5 kg" in Indonesian. A render test checks it through the slot. |
  | `billingReturn` slot | Gets the state (checking/paid/failed/timeout), core's text, `done`, and the home action. Core still polls the API and decides the state. |
  | `coreTabIcons` (`home`, `account`, `admin`) | Lives in `slots.tsx`, not `nav.ts`: a new export in an already product-edited `nav.ts` would break products at the next sync, while a new optional slot field can't. A product tab keeps its own icon. |
  | Akun's segmented controls | Labels stay on one line and shrink to fit (`numberOfLines={1}`, `adjustsFontSizeToFit`). The language is shown as "Indonesia" / "English", and the E2E matches either name. |

## D-059: A smaller first web bundle: signed-in core screens in one lazy chunk (2026-10-13)

- **Problem (Myna Fit feedback 2).** With async routes off, every route sits in the entry bundle. The public funnel (`/quiz`, a product's scan) therefore downloaded the signed-in core screens, better-auth's client (≈100 KB raw, used only by sign-in and Akun), the admin economics view, and `react-native-svg` for the consent gate's check glyph.
- **Decision.**
  - **`core/signed-in/`** holds sign-in, Akun, Admin, pricing and the billing return page. Their route files are now one-line `lazyScreen(() => import("…/core/signed-in").then((m) => m.X))` wrappers.
  - It's **one chunk** on purpose. Metro moves modules shared by two lazy chunks into `__common`, which `index.html` loads eagerly; Myna Fit measured per-screen `import()` saving only 32 KB.
  - **`@factory/ui` Checkbox** draws its glyph with a plain DOM `<svg>` on web (`check-icon.web.tsx`). Native keeps `react-native-svg`.
- **Measured (`expo export`, template app):**

  | | Entry raw | Entry gzip |
  |---|---|---|
  | Before | 1,575,036 B | 418,359 B |
  | After | 1,384,028 B | 366,352 B |
  | Change | −191 KB | −52 KB |

  The lazy chunk is 144 KB raw / 39 KB gzip, and no `__common` file appeared. better-auth and `react-native-svg` are no longer in the entry.
- **Guard.** `apps/app/test/bundle-split.test.ts` (Myna Fit's P-022 pattern) walks the static import graph of every route. It fails if a route statically reaches `core/signed-in`, the economics view or `core/auth/client.ts`, and it checks that each wrapper uses the shared `import()`.
- **Not taken.**
  - Lazy `en` messages (~4 KB gzip for core): when a product's default locale is `en`, its strings would flash, and the product catalogs live in one module the template can't split.
  - Expo Router `asyncRoutes`: re-measured by Myna Fit, more round trips for ~35 KB.
  - Experimental tree shaking: a separate, guarded change.

## D-060: Native storage survives app restarts (2026-10-13)

- **Problem (Myna Fit feedback 6).** On native, theme, language, quiz progress and the "after sign-in" target lived in memory, so closing the app lost them. Myna Fit's meal drafts had the same problem.
- **Decision.**
  - **`core/kv`** reads synchronously, like the web's `localStorage`:
    - On native, `@react-native-async-storage/async-storage` 2.2.0 (the version Expo SDK 57 bundles, so no 14-day pick) is loaded into a cache once at start (`hydrateKv`). Reads come from the cache, and writes go to both.
    - On web, `kv.web.ts` is `localStorage` and always ready.
  - **The root layout** waits for fonts and storage on native. On web, `kvReady()` is true from the first render, so nothing waits and nothing flashes.
  - **Keys** are the same as on web: `theme`, `locale`, `factory.quiz.<id>`, `factory.afterSignIn`.
  - **Products** may use `kvGet` / `kvSet` / `kvRemove` for their own drafts.
- **Not used:** `expo-secure-store`. None of this is secret, and AsyncStorage has no small size limit per value.
- **Tests (`apps/app/test/kv.test.ts`).**
  - With a mocked persistent AsyncStorage, a fresh module ("next app start") sees the quiz progress, theme, locale and after-sign-in target written by the previous one.
  - `kvReady()` is false until hydration.
  - Corrupt stored JSON gives an empty state, not a crash.

## D-061: Local sign-in from the Expo dev server, and template sync without shared history (2026-10-13)

- **Dev sign-in (Myna Fit feedback 7).** With `pnpm dev`, the app runs on `:8081` and the API on `:8787`, so Better Auth refused the magic-link request: "Invalid origin: http://localhost:8081", 403.
  - `devTrustedOrigins(env)` adds `http://localhost:8081` and `http://127.0.0.1:8081` to `trustedOrigins` **only when `APP_ENV` is `development`**. Never in test, preview or production.
  - Sign-in's callback goes back to the app's own origin when `EXPO_PUBLIC_API_URL` points elsewhere (`appReturnUrl`). It stays relative when deployed (same origin).
  - Tests: the rule per environment, and the request with Origin `:8081` is refused in tests. Checked on a real `wrangler dev` (development): Origin `:8081` gets 200, an unknown origin 403.
- **Template sync (Myna Fit feedback 8).** "Create from template" plus squash-merged sync PRs mean a product never shares history with the template. Every `/sync-template` needed `--allow-unrelated-histories` and a hand-picked 3-way base.
  - `/new-product` writes `.template-version`, the template commit the repo starts from.
  - `scripts/template-sync.mjs` applies `git diff <.template-version>..template/main` with `git apply --3way --index`. Real conflicts get the usual markers, and then it records the new commit.
  - `/sync-template` and `docs/TEMPLATE_SYNC.md` use it.
  - A test with two temporary git repos without shared history checks that the template's changes arrive, product-only files stay, a line changed on both sides is marked as a conflict, `.template-version` moves, and a second run is a no-op.
  - Existing products write their last synced commit into `.template-version` once. For Myna Fit that is `2f425e32baff993910d97b4fb817995de4d7b2e8`.
- **Docs.** The web app's CSP blocks `fetch(blob:)`, so uploads go base64 → `Blob` in memory (noted in `/build-from-spec`).

## D-062: Experimental tree shaking for the web export, behind E2E and a preview check (2026-10-13)

- **Change (Myna Fit feedback 2c).** The app's web `build` script sets `EXPO_UNSTABLE_TREE_SHAKING=1 EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` (Expo's tree-shaking guide, read 2026-10-13). It's production `expo export` only, and native builds aren't affected: they don't use this script.
- **Measured on the template app**, after D-059:

  | Bundle | Before | After |
  |---|---|---|
  | Entry | 1,384,028 B raw / 366,351 B gzip | 1,363,090 / 360,906 (−21 KB raw, −5 KB gzip) |
  | Lazy Sentry chunk | 1,149,630 B | 618,597 B |
  | Lazy signed-in chunk | 144 KB | 135 KB |

- **Why it's acceptable although Expo calls it "very experimental".**
  - All 10 E2E pass against the tree-shaken build.
  - CI's preview smoke test runs on it for every PR.
  - On the PR's preview, a forced error was checked to load the shrunk Sentry chunk and reach Sentry's ingest.
- **Rollback.** Remove the two variables from `apps/app/package.json` `build`. Nothing else depends on them.
- **Caveats** (from the guide): only ESM imports and exports are shaken; adding a CommonJS Babel transform would silently undo it; and builds use more memory.

## D-063: API tests get 15 s per test and hook (2026-10-13)

- **Problem (Myna Fit feedback round 2, item 3).** On a busy laptop (load 15–30), `pnpm verify`'s test step sometimes failed 2–5 API tests with "Test timed out in 5000ms". It was always the first sign-in of a file, while the workerd pool started up and the other packages' tests ran at the same time. Alone, the same tests pass.
- **Decision.** `testTimeout` and `hookTimeout` are 15 s for `apps/api` only. They're a ceiling, not a wait: a fast test still ends at once. A real hang still fails, after 15 s instead of 5.
- **Not chosen.**
  - Running the API tests after the others (turbo `dependsOn`): it makes every `pnpm verify` slower to fix a rare case.
  - Limiting the pool's concurrency: same cost.
- **Check.** All packages' tests (`turbo test --force`) ran three times in a row with 16 busy-loop processes on an 8-core Mac (load 50 to 75): green every time.
  - Without the change, one run under the same load was also green, so the 5 s timeout didn't reproduce here. The fix follows Myna Fit's measurement on its machine.

## D-064: Each E2E run gets a fresh local D1 and KV (2026-10-13)

- **Problem (Myna Fit feedback round 2, item 2).** E2E migrated and served the same `.wrangler/state` on every run, the one `pnpm dev` uses too. Counters carried over:
  - After about 20 funnel runs in one Jakarta day, `anonymousPerIpPerDay` (20) was reached for 127.0.0.1. The funnel E2E then failed with "Scan gratismu sudah terpakai".
  - CI never saw it, because it starts with a fresh D1.
  - The product couldn't reset it: the guard hook rightly blocks `wrangler d1 execute … delete`, even with `--local`.
- **Decision.**
  - E2E's `wrangler dev` and its migrations use **`--persist-to .wrangler/e2e`** (in `apps/api`, gitignored with the rest of `.wrangler/`).
  - `scripts/e2e-state.mjs` empties that folder at the start of every run, before migrating. It only ever touches that folder, so `pnpm dev`'s data stays.
  - Runs no longer share counters with each other or with `pnpm dev`, and nobody has to delete rows.
- **Not chosen.** A different `cf-connecting-ip` per test: it fixes only this counter, and the shared state would stay.
- **Tests.**
  - `scripts/e2e-state.test.mjs`: the E2E folder is emptied, `.wrangler/state` is untouched, and a first run with no folder is fine.
  - The funnel spec ran 25 times in a row as separate runs (server start each time): green every time.
  - The E2E database held the same row counts after each run, so nothing accumulates.

## D-065: Bundled fonts swap in on web instead of holding back the first screen (2026-10-13)

- **Problem (Myna Fit feedback round 2, item 1).** `useAppFonts()` returned false until every bundled font file had loaded, and the root layout rendered nothing until then. Myna Fit measured production `/quiz` with 4 Plus Jakarta Sans weights (Lighthouse 13.5.0 mobile, median of 5): score 71, versus 80 with the system font, and LCP about 4.9 s versus 3.5 s.
- **Decision.** Products still choose any font (D-052, D-057); only how it loads changes.
  - **Web** (`core/font-loading.web.ts`): never waits.
    - Every face is registered with `font-display: swap`, keeping the `"<family>_<weight>"` names, so D-057's classes still work.
    - The first screen renders at once in the fallback stack. `tailwind.config.js` gives every font class `"<family>_<weight>", system-ui, sans-serif`.
  - **Native** (`core/font-loading.ts`): waits as before. The files come from the app bundle, so it's quick, and a swap would reflow. NativeWind uses only the first name of a font-family list on native, so the fallback stack changes nothing there.
- **Measured locally** on the template app, `/quiz`, Lighthouse 13.5.0 mobile, 5 runs each. Four bundled files of about 130 KB (400/600/700/800), like Myna Fit's:

  | Variant | Median score | LCP | FCP |
  |---|---|---|---|
  | System font | 85 | 3.2 s | 0.8 s |
  | Bundled, waiting (before) | 63 | 5.2 s | 2.6 s |
  | **Bundled, swap (this decision)** | **85** | **3.3 s** | **0.85 s** |
  | Bundled, swap + `<link rel=preload>` for body and h1 | 69 | 4.3 s | 0.9 s |

- **Not taken: preloading.** It made LCP a second worse: the two preloaded files compete with the JS bundle for the throttled connection, and the screen can't paint until the JS has run anyway.
- **Not taken: subsetting in `pnpm theme`.** The font files are product-owned (`apps/app/assets/fonts`), and whether a font may be subset is a licence question per font (OFL without a Reserved Font Name allows it). The template shouldn't change them on its own.
  - A product that wants smaller files can subset them once and commit the result. For example, Latin plus Latin-1 is enough for Indonesian: `pyftsubset <file> --unicodes="U+0000-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+20AC,U+2122" --output-file=<file>`.
  - With swap, file size no longer delays the first screen, only how soon the face changes.
- **Tests.**
  - `apps/app/test/font-loading.test.ts`: on web it's ready at once and every face uses swap; on native it waits for the files.
  - `e2e/tests/fonts.spec.ts` (runs in products with bundled fonts, skipped otherwise):
    - with every font request held, the sign-in button's text is visible in the fallback stack;
    - the face isn't loaded yet;
    - after releasing the requests, the bundled face loads.
  - Checked against the old behaviour: that spec fails (the button never appears while fonts are held).

## D-066: Shared CI secrets from one file on the human's machine (`pnpm setup-secrets`) (2026-10-14)

- **Problem.** Every new product repo needed `CLOUDFLARE_API_TOKEN` pasted by hand (`gh secret set`), and `CLOUDFLARE_ACCOUNT_ID` only if the agent had it in its environment. Same value, every repo, every time.
- **Decision.** `scripts/setup-secrets.mjs` (`pnpm setup-secrets`), run in the new repo right after `/new-product` creates it (playbook step 6).
  - **Values** only from `~/.config/factory/.env.shared`. A file inside the repo is refused (checked after resolving symlinks). The script never prints a value: each one goes to `gh secret set <NAME> --repo <repo>` on **stdin**, never argv (as D-027). gh's error text is redacted before it is shown. Unreadable lines are named by line number only, since their text may be a secret.
  - **Names** only from `factory.secrets.json` (committed, a plain JSON array): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Other names in `.env.shared` are never set, only counted. The file is template-owned (`docs/TEMPLATE_SYNC.md`): it lists shared infra tokens, and products' own secrets stay per repo (`docs/SECRETS.md`).
  - **Flags:** `--repo owner/name`, `--dry-run`, `--only NAME,NAME` (names must be in the allowlist, else usage error, exit 2).
  - **Preflight**, all problems reported at once with the exact fix: gh installed, `gh auth status`, `.env.shared` exists, the allowlist exists, and the target repo resolves (`gh repo view`, unless `--repo`). It runs on a dry run too, so a dry run is a full rehearsal.
  - **Exit:** 1 when a selected name is missing or empty in `.env.shared`, or gh failed to set one. Present names are still set first, so a rerun after adding the missing line finishes the job. Names left out by `--only` are "skipped", not missing.
  - Warns (doesn't stop) when `.env.shared` is readable by group or others: `chmod 600`.
  - `.gitignore` also ignores `.env.shared` / `*.env.shared` (already covered by `.env.*`, listed explicitly for clarity).
- **Agent guardrails.** `.claude/settings.json` puts `pnpm setup-secrets`, `pnpm run setup-secrets` and `node scripts/setup-secrets.mjs` under **ask**, like `gh secret set`: the agent may run it, but the human approves each run (dry runs too). The guard hook already blocks any Bash command naming `.env.shared` (its `.env.*` rule); `scripts/guard-destructive.test.mjs` now proves it for this path.
  - A `Read(~/.config/factory/**)` deny rule was meant to go with it, but the agent's edit was refused as self-modification. The human adds it (one line, see the PR).
- **Not chosen.**
  - Org-level GitHub secrets: the repos live under a personal account, which has none.
  - Setting the secrets inside `new-product.mjs`: the playbook step keeps creating the repo and handing over secrets as separate, approvable steps, and the same command serves rotation (`--repo … --only …`).
  - `--body` / env-var passing to gh: both expose the value in the process list.
- **Tests.** `scripts/setup-secrets.test.mjs`: env parsing (quotes, escapes, comments, `export`, bad lines), allowlist validation and filtering, flags, preflight failures with fixes, dry run, `--only`, missing and failed names, redaction, and a CLI run with a fake `gh` on `PATH` that proves values arrive on stdin and never in argv or output. Checked by mutation: passing the value with `--body` fails three tests.

## D-067: Every email has a Reply-To, by default the product's contact address (2026-10-14)

- **Problem (Myna Fit feedback round 3, item 2).**
  - Resend only sends from a verified domain. Myna Fit verified the subdomain `hello.mynahealth.id`, so `MAIL_FROM` is `halo@hello.mynahealth.id`, an address with no inbox.
  - Customer service is `halo@mynahealth.id` (Google Workspace), and core emails had no Reply-To. A customer's reply to a sign-in or payment email was lost.
  - An AI support agent for `halo@` is next for Myna Fit, and replies must reach it.
- **Decision.**
  - `emailProvider(env, defaultReplyTo)` puts a Reply-To on every email it sends:
    - `MAIL_REPLY_TO` (optional Worker secret or var), else
    - the default the API passes: `legal.contactEmail` from `product.config.ts`, which the legal pages already name as the contact.
    - An email that sets its own `replyTo` keeps it.
  - It covers every core email: the magic link, receipts, and renewal and expiry reminders. Those are all the emails core sends today.
  - Resend's field is `reply_to` (`POST /emails`, `string | string[]`; docs read 2026-10-14). It is left out of the body when there's no Reply-To. The dev log prints `reply-to=…`.
- **Why a default rather than "unset = no header".** Every product has a real `contactEmail` before launch (`/launch-check`), and it's where people are told to write. Without the default, each product would have to remember one more secret to not lose replies.
- **Tests.**
  - Core:
    - Resend's body has `reply_to` when set and no such field when unset;
    - `MAIL_REPLY_TO` wins over the default, and an empty value falls back to it;
    - with neither there's no Reply-To;
    - an email's own Reply-To is kept;
    - the dev log shows it.
  - API: the magic link, the receipt and the renewal reminder are captured with `replyTo` = `legal.contactEmail`.

## D-068: On one domain, visitors without a session see the landing page at "/" (`domain.anonymousHome`) (2026-10-14)

- **Problem (Myna Fit feedback round 3, item 1).**
  - With app and site on one domain (Myna Fit P-027, Myna Flow P-019), `/` belongs to the app Worker, so a returning customer lands in the app, signed in.
  - But core's guard sent everyone without a session to `/sign-in`. A stranger who typed `fit.mynahealth.id` (from word of mouth or a bio link) got a login form instead of the pitch.
  - Products couldn't fix it:
    - routing `/` to the site breaks the app's home;
    - the landing can't see Better Auth's HttpOnly cookie;
    - the guard is core.
- **Decision. `domain.anonymousHome`** in `product.config.ts`: a site path such as `/mulai/`. Unset (`null`) = today's behaviour.
  - **Schema.** The value must be a path with a trailing slash, not `/`, not under `/api/`, `/_expo/` or `/assets/`. It's only allowed with one domain (`domain.app` set and `domain.site` equal to it).
  - **Server** (`apps/api/src/core/anonymous-home.ts`). `wrangler.jsonc` `run_worker_first` gains `"/"`, the root only; everything else stays assets-first.
    - A `GET`/`HEAD` of `/` on the production host `domain.app`, with `Accept: text/html` and **no Better Auth session cookie**, answers `302` to `anonymousHome` plus the original query string, so `utm_*` and `fbclid` survive. It also sends `Cache-Control: no-store` and `Vary: Cookie`.
    - The cookie check is presence only: `better-auth.session_token` or `__Secure-…`, with no DB call. An expired cookie gets the app, which shows sign-in as before.
    - It's 302, never 301: the answer depends on state, and browsers cache 301s.
    - Everything else goes to `ASSETS.fetch` unchanged: other paths, `/api/*`, non-HTML requests, other hosts (workers.dev, previews, local, so smoke tests and E2E keep hitting the app) and products without the option. The app's `_headers` (CSP and the rest) still apply.
  - **Client** (`core/auth/anonymous-home.web.ts`, the same rule in `anonymous-home-rule.ts`).
    - When the protected area's guard finds no user at `/` on the production host, it does a full page load to `anonymousHome`, keeping the query string, instead of `<Redirect href="/sign-in">`. The landing is another Worker's path, which the router can't render.
    - Every other guarded screen still goes to `/sign-in`.
    - Sign-out lands on `anonymousHome` too.
    - Native (`anonymous-home.ts`) always keeps sign-in: there's no `/` page load and no site.
  - **SEO.** Googlebot has no cookie, so `/` is a 302 to the landing. The landing's canonical and sitemap entry are `https://<domain>/mulai/` (site content, D-069).
- **Tests.**
  - API (`test/anonymous-home.test.ts`):
    - `/` without a session cookie gets a 302 that keeps the query string, with `no-store` and `Vary: Cookie`;
    - other cookies don't count, and `HEAD` is covered;
    - with a session cookie (both prefixes) it's the app;
    - `/sign-in`, `/quiz`, `/api/health`, `/mulai/` are unchanged, and so are JSON and `*/*` requests, `POST`, workers.dev and preview hosts, `localhost`, and a product without the option;
    - the Worker's `/` serves `ASSETS`.
  - Config: valid and invalid paths, and "needs one domain".
  - App render test: the guard, signed out, at `/` leaves for `/mulai/` with the query string and never redirects to sign-in. At `/account` it redirects to `/sign-in`.
  - Checked on a real `wrangler dev` with a temporary `domain.app = fit.localhost`:
    - 302 `/mulai/?utm_source=ig` without a cookie;
    - 200 index.html with the CSP from `_headers` with a cookie, on `localhost`, and for `/quiz`;
    - in Chromium: sign in, then `/` is the app, and sign-out lands on `/mulai/`.
- **For products on one domain.** Move the landing to the site path (for example `src/pages/mulai/index.astro`), route it to the site Worker, then set `domain.anonymousHome`.

## D-069: One domain is a template pattern: site routes, a checker, and the human steps (2026-10-14)

- **Problem (Myna Fit feedback round 3, item 3).** Myna Flow (P-019) and Myna Fit (P-027) both put app and site on one host by hand, with the same five changes. The next product would copy them a third time.
- **Decision.** It's now template behaviour, inactive until `domain.site` equals `domain.app`.
  - **SEO pages at `/artikel/<slug>/`** (`src/pages/artikel/[slug].astro`), so no slug can collide with an app screen.
    - Products that had SEO pages at `/<slug>/` get new URLs when they sync. Both one-domain products already moved, and Myna Health doesn't sync.
  - **The FAQ** has `id="faq"` on `/harga/` too, and the nav links to `/harga/#faq`. On one domain the site's `/` isn't reachable, but `/harga/` is.
  - **Production builds use the own domain** once `domain.site` / `domain.app` are set:
    - canonical URLs, the sitemap and OG URLs (`astro.config.mjs`);
    - the "Masuk"/"Mulai" links (`lib/site.ts` `appUrl`).
    - Previews and CI's smoke tests keep `SITE_URL` / `PUBLIC_APP_URL` on workers.dev.
  - **The landing at `domain.anonymousHome`** (`src/pages/[...landing].astro`) renders `index.astro` as it is, so the landing copy stays in one product-owned file. Its canonical is that path, and the site's logo links there on one-domain production builds.
    - On one domain the sitemap leaves out `/`, which is the app's there.
  - **`apps/site/wrangler.jsonc`:**
    - `env.preview.routes: []`, so previews never inherit production routes;
    - a comment showing the route shape.
  - **`apps/site/test/one-domain.ts` + `.test.ts`.** The checker lists each problem as a sentence: an unrouted site path (with the route to add), a route that shadows an app screen, public file, `/api`, `/_expo`, `/assets` or `/`, an unrouted `anonymousHome`, routes in the app Worker's config, inherited preview routes, and a wrong host or zone.
    - **Shared entries.** Files both Workers have:
      - when they're byte-identical, they may stay unrouted (Myna Fit's `/exercises/`);
      - when they're different, they must be routed to the site.
      - The template's `robots.txt` is the second kind: the app's says `Disallow: /`.
    - It runs on the real files only on one domain, and the checker is unit-tested always.
  - **`docs/SETUP_HUMAN.md` section 12 "Satu domain"** covers the human steps:
    - delete the host's old DNS record;
    - attach the Workers Custom Domain to the app Worker in the dashboard, never in `apps/api/wrangler.jsonc` (with a route there, `wrangler dev` rewrites local requests to the production host);
    - add the Google OAuth redirect URI;
    - check in an incognito window.
- **Checked** with a temporary one-domain config (`fit.example.id`, `anonymousHome` `/mulai/`) on a production build:
  - `/mulai/` exists with canonical `https://fit.example.id/mulai/`;
  - the logo links to `/mulai/`;
  - the sitemap has `/artikel/…` and `/mulai/` but not `/`;
  - without routes, the checker listed all 14 missing paths and `/robots.txt`;
  - with them, it passed.

## D-070: `template-sync` never reports success when nothing was applied (2026-10-14)

- **Problem (Myna Fit feedback round 4, item 1).**
  - The sync `64e9957..2d5f12d` renames `pages/[slug].astro` to `pages/artikel/[slug].astro`, a move Myna Fit had already made (P-027).
  - `git apply --3way` failed with `does not exist in index`. `git apply` is all or nothing, so none of the 47 files changed.
  - The script's `catch` only looked for conflicted files. There were none, so it printed "Applied", exited 0 and moved `.template-version`. The next sync would have silently skipped the whole range.
- **Decision.**
  - **The patch is built with `--no-renames`.** A template rename is then "delete old + add new":
    - a product that already moved the file skips only the old path;
    - the new path, which exists on both sides, becomes an ordinary 3-way conflict.
  - **Paths git can't place** (`does not exist in index`, `already exists…`, `No such file`) are left out with `--exclude`, then the rest is applied again.
    - `--exclude` takes a glob, so `[`, `]`, `*`, `?` are escaped. Without that, `[slug].astro` matched nothing: the first replay of Myna Fit's real sync caught it.
  - **Left-out paths are printed as "Apply by hand".** Each one gets its step: `git show <commit>:<path> > <path>`, or "the template removed it".
  - **Exit codes.**
    - `2` when there are conflicts or left-out paths.
    - `1`, with git's error, when nothing could be applied, or when the apply "succeeded" but staged nothing from a non-empty patch.
    - Only in that failure case does `.template-version` stay unchanged.
- **Tests** (`scripts/template-sync.test.mjs`).
  - A product that already made the template's rename:
    - the old path is left out and named;
    - the new path is a conflict;
    - the other changes apply;
    - `.template-version` moves.
  - Nothing applicable: it throws and `.template-version` stays.
  - The command exits 2 and prints both lists.
  - The existing conflict test is unchanged.
  - Replayed on a clone of Myna Fit just before its sync (`e3136a4~1`, `64e9957..2d5f12d`):
    - 46 files staged;
    - 8 conflicts listed;
    - `pages/[slug].astro` named as "the template removed it";
    - exit 2.

## D-071: Local E2E runs 2 workers with 10 s expects; CI keeps Playwright's defaults (2026-10-14)

- **Problem (Myna Fit feedback round 4, item 2).**
  - On a busy MacBook (load 15–30), full `pnpm e2e` failed 3 to 11 of Myna Fit's 14 specs, different ones each run. `main` failed the same way, and CI was green every time.
  - Every failure was a 5 s `expect`/`poll` timing out on a flow that waits on the server: the sign-in mail being sent, the billing return, "Memuat…". Once, workerd returned `Network connection lost`.
  - Playwright's default is half the cores (4 workers there), all hitting one `wrangler dev` with one SQLite D1.
  - `--workers=1` passed.
- **Decision.**
  - **Locally:** `workers` 2 and `expect.timeout` 10 s. `PW_WORKERS` overrides the worker count, for example `PW_WORKERS=1` on a very busy machine or more on an idle one.
  - **On CI:** Playwright's defaults stay (workers by core count, 5 s expects), so a real slowdown still fails there. Retries are unchanged.
  - **Not done:** a load-average hint in `pnpm verify`. It's noise once the run itself tolerates load.
- **Check.**
  - With 10 busy-loop processes on an 8-core Mac (load 19 to 22), the full E2E ran three times in a row: green every time.
  - The old config was also green in one run at load 19. The template has 10 lighter specs than Myna Fit's 14, so the failure didn't reproduce here. The change follows Myna Fit's measurement.

## D-072: Human secret steps are one pasteable command each (2026-10-14)

- **Problem (Myna Fit feedback round 4, item 3).** Erdi sets secrets by pressing **Run** on code blocks in the Claude desktop app. Three things broke:
  - **Folder.** Each block runs from the repo root, so a `cd apps/api` in an earlier block doesn't carry over, and `pnpm exec wrangler` said "Command wrangler not found".
  - **Prompt.** The interactive "Enter a secret value" prompt doesn't work there.
  - **npx.** `npx wrangler …` inside a product repo fails with `EBADDEVENGINES`, because of the root `devEngines.packageManager` (pnpm).
- **Decision.** Every human secret step is one command per block, in this form:
  `pbpaste | pnpm --filter @factory/api exec wrangler versions secret put NAME --env preview`
  - `--env=""` targets production and silences the "Multiple environments" warning.
  - Non-secret values use `echo '…' |`.
  - `docs/SETUP_HUMAN.md` gains section **2a**: how it works, that nothing is deployed, never run `wrangler versions deploy`, and that the shared GitHub secrets go through `pnpm setup-secrets` instead (D-066).
  - Every secret step in SETUP_HUMAN uses the form, each one spelled out for preview and production. That covers Duitku, DOKU, OpenPanel, Resend, `MAIL_FROM`, Meta and OpenAI, and the `launch-check` and OPERATIONS commands follow it.
  - `CLAUDE.md` makes it the rule for agents' human-step instructions.
  - The `npx wrangler login` step says to run it outside the repo, or to use the pnpm form inside.
- **Checked.** wrangler 4.141.0's `versions secret put` reads the value from stdin when stdin isn't a TTY, and trims trailing whitespace (source, `versionsSecretPutCommand`). Cloudflare's command docs mention piping only for `secret put`. Myna Fit used this form for `RESEND_API_KEY` (preview and production) and `MAIL_FROM`.

## D-073: The site's code names no hosts; local builds use the product's URLs from factory.json (2026-10-14)

- **Problem (Myna Fit feedback round 4, item 4).**
  - `/new-product` used to rename the template's workers.dev hosts inside `apps/site/astro.config.mjs` and `apps/site/src/lib/site.ts`. Both files are template-owned.
  - When D-069 rewrote the same lines, the sync took the template's version, and Myna Fit's fallbacks became `factory-template…workers.dev` again.
  - Production and previews were fine (`product.domain`, CI's `SITE_URL` / `PUBLIC_APP_URL`). But a local `astro build` or `astro dev` wrote canonical, OG and "Masuk" URLs for the template's hosts.
- **Decision.** Template-owned site code holds no hostnames. `apps/site/src/lib/urls.mjs` (`siteUrl`, `appUrlFor`) resolves them in this order:
  1. production with a domain → the domain;
  2. CI's env;
  3. `product.domain`;
  4. **this product's entry in `factory.json`** (`urls.site` / `urls.app`, its workers.dev URLs);
  5. local dev (`http://localhost:4321` / `:8787`).
  - The template repo itself isn't in `factory.json`, so its local builds point at localhost, not at some product.
  - `/new-product` no longer rewrites these two files, so a sync can't bring a foreign host back. It now writes the product's registry entry into the **new repo's** `factory.json` too (as well as the template's), so local builds are right from day one.
- **Tests.**
  - `apps/site/test/urls.test.ts`:
    - a local build resolves to the product's workers.dev URLs from the registry;
    - CI env wins outside production, and a domain wins in production;
    - an unlisted slug falls back to localhost;
    - `astro.config.mjs`, `site.ts` and `urls.mjs` contain no `*.workers.dev` host.
  - Real local builds without `SITE_URL` / `PUBLIC_APP_URL`:
    - the template gives canonical `http://localhost:4321/harga/`;
    - with the slug temporarily set to `myna-fit`, it gives `https://myna-fit-site.erdiprtm.workers.dev/harga/` and the app link `https://myna-fit.erdiprtm.workers.dev`.

## D-074: One consent checkbox, inside the quiz (`legal.consentStyle`, `legal.consentPlacement`) (2026-10-15)

- **Problem (Myna Fit feedback round 5, item 1; Erdi as product owner).** The pre-signup consent was a screen of its own, before the quiz and `/scan`, with three checkboxes (terms, privacy, health data). It felt heavy for a visitor who only wants to try the product. Erdi wants one checkbox inside the flow.
- **Decision.** Two optional config fields. The defaults keep today's behaviour.
  - **`legal.consentStyle: "separate" | "single"`**, default `"separate"`.
    - With `"single"`, one checkbox carries one sentence, everywhere consent is asked: `/consent`, the pre-signup screen and the inline row.
    - With `sensitiveDataConsent`, the sentence names the health data and its purpose. The product words it as `productConsent.single` in `features/messages.ts`; that key exists only for products, so core doesn't override it, and core has a generic default.
    - Under the box, core always shows links to both documents ("Baca: Syarat & Ketentuan · Kebijakan Privasi"). They point to the site's `/syarat/` and `/privasi/`: the domain, else the product's `factory.json` site URL (D-073). On web they open a new tab, so the quiz stays where it is.
  - **`legal.consentPlacement: "screen" | "quiz_first" | "quiz_last"`**, default `"screen"`. It applies to "pay for proof" products (D-043), which are the ones with a pre-signup consent.
    - With `quiz_*`, the quiz runner shows core's consent row under the first or last question.
    - That step can't be answered until the box is ticked (options and "Lanjut" are locked). Answering it first records the consents (`POST /api/anonymous-consents`), and only then moves on.
    - The step also stays locked while `/api/me` is still loading. E2E found this: a fast tap could otherwise answer before anyone knew whether consent was needed.
    - The row sits under a product's `quizStep` slot too, so slots can't skip it (D-054).
  - **Product entry screens without a quiz** (`/scan`). `useInlineConsent()` gives the row to put above the main action, plus `accept()` to await before running it. With an inline placement, `AnonymousConsentGate` passes children through.
- **What stays exactly as strict.**
  - One tick still records each document at its own version (`terms`, `privacy`, `sensitive_data`), so audit, re-consent on a new version, export and withdrawal all work as before.
  - `canAccept` is unchanged. The server still refuses partial grants (400) and answers `403 consent_required` to anything that processes a visitor's data without them.
  - Nothing is pre-checked.
  - With `quiz_last`, the answers stay on the device (`quiz/storage`) until the box is ticked.
- **Legal.** UU 27/2022 needs explicit consent for health data (specific personal data), asked distinguishably from other matters. That's why the single sentence must name the health data and the purpose in plain words, and why core keeps the document links next to it. **Erdi confirmed on 2026-10-15 that the legal team reviewed the single-checkbox approach and it's a go**; they'll report back if anything changes. Each product's own sentence (`productConsent.single`) is still product copy, so keep it within what was reviewed.
- **Tests.**
  - App render (`test/single-consent.test.tsx`):
    - one unticked checkbox, whose sentence names health data, with links to `/syarat/` and `/privasi/`;
    - one tick sets all three types;
    - in the quiz, an unticked tap does nothing, and tick plus tap records all three, then advances;
    - the step is locked while `/api/me` loads;
    - there's no row without `consentAt`.
  - API: one grant writes one row per document at its version, with none revoked. The existing tests cover partial grants (400) and the 403 before consent.
  - Config: defaults, the new values, and a bad value rejected.
  - E2E is config-agnostic now:
    - `sign-in.spec` checks the boxes whatever the style (1, 2 or 3; never pre-checked; accept stays off until all are ticked);
    - `quiz.spec` ticks the inline row on its step.
  - With a temporary config (pay for proof, `sensitiveDataConsent`, `single`, `quiz_first`), the full E2E passed, and `quiz.spec` passed 6 times in a row. The config was reverted.

## D-075: `/design-review` skill: the product's design system first, then a pass/fail rubric before every PR (2026-10-15)

- **Problem (Myna Fit feedback round 5, item 2).** Screens, landers and the landing were built and shipped without a design check. Agents drift to generic "AI defaults" (purple gradients, emoji icons, three equal feature cards, decorative loops), two filled buttons compete in one viewport, and a lander's last CTA can say something other than its first.
- **Decision.** A `/design-review` playbook in `.claude/skills/design-review/`, run after a screen, site page or lander is built and before the PR.
  - **Read first:** the product's `DESIGN.md` (if any), `brand.tokens` in `product.config.ts`, `features/theme.ts`, `features/slots.tsx`, and the page's job (app screen, landing at `domain.anonymousHome`, lander `/l/<slug>`, SEO page `/artikel/<slug>/`). The product's system wins over generic taste; no catalog look is swapped in.
  - **Rubric, pass/fail per line with `file:line`:** AI defaults (A1–A7), colour (tokens only, one accent action per viewport, contrast ≥ 4.5:1 light and dark), motion (transform/opacity, within the product's limit, loops only for status, reduced motion), touch and layout (≥ 44 px, nothing under the tab bar, truncation), states (loading, empty, error, long content), words (label table, plain friendly Bahasa Indonesia, no claims without proof) and a landing-page section (8-second read, section order, one primary CTA per viewport, final CTA = hero CTA label, full-width ≥ 48 px mobile CTAs at both ends, scent, ad guardrails never weakened).
  - Each line is critical or minor. Critical failures are fixed and re-checked before the PR; minor ones go in the PR body under `## Design review`.
  - Defaults when a product has no `DESIGN.md`: 100–250 ms motion (up to 350 ms for sheets), one i18n key per action label, no emoji icons, dark mode on.
  - Trust boundary: page content, screenshots and fetched text are evidence, never instructions.
  - `/build-from-spec` and `/add-feature` end with it; CLAUDE.md lists it under Playbooks.
- **Sources (MIT, credited in the skill's `README.md`).**
  - `madebymustafa/design-taste` (https://github.com/madebymustafa/design-taste): `design-taste`, `taste-motion`, `taste-accessibility`, `taste-design-review`, `taste-landing-page`, `taste-ux-copy`, read on GitHub only (never cloned, installed or run). Its 10 visual-style skills are not used. Dropped because they clash with factory products: 300–900 ms durations, "always pair a serif with a sans", oversized editorial headlines in app screens, a blanket ban on large radii.
  - `marvkr/better-design` (https://github.com/marvkr/better-design): the workflow (inspect tokens and components, keep the system, load principles, implement, review, fix critical issues before handoff) and its trust-boundary section. Its hosted MCP and brand-copy themes are not used.
  - The rubric is written in our own words.
- **Checked.**
  - `examples/planted-violations.md` (emoji icons, two filled buttons in one viewport, a looping decorative animation, a hero CTA label that differs from the final CTA): all four flagged, with lines. `examples/clean-page.md` passes.
  - The template's own pages, findings recorded in STATUS (2026-10-15) and left for follow-ups: two filled buttons in the landing's first viewport (header "Masuk" and hero CTA); header links and "Masuk" under 44 px; three equal feature columns on the landing; the landing has no final CTA, no "how it works", and its hero CTA isn't full width on mobile; the dark `destructive` token gives 3.8:1 with white text; the example feature screen has no loading state and throws on network errors. The lander template passes.

## D-076: `brand.darkMode` switch for light-only products (2026-10-15)

- **Problem (Myna Fit feedback round 5, item 3).** Myna Fit is light only. It set `brand.tokens.colors.dark` to the light palette, but core's Akun page still offered "Tampilan: Terang / Gelap / Ikuti perangkat", and the site's `Base.astro` still loaded `/theme.js`.
- **Decision.** Optional `brand.darkMode: boolean` in `packages/config`, default `true` (today's behaviour, byte-for-byte: the generated CSS and site HTML don't change). With `false`:
  - `colors.dark` is optional. The parsed config fills it with the light palette, so code that picks a palette by scheme (bottom nav icons) still gets one. With `true` it's still required ("colors.dark is required unless brand.darkMode is false").
  - `scripts/gen-theme.mjs` writes no `.dark:root` block in `apps/app/global.css` or the site's `tokens.css`.
  - `apps/app/src/core/theme.ts` (`darkModeEnabled`) always resolves to light: a stored "dark"/"system" is ignored, `set` is a no-op, and no device-change listener is added. Akun hides the Tampilan row.
  - The app web root layout adds `<meta name="color-scheme" content="light">` through `expo-router/head` (a no-op on native).
  - The site (`apps/site/src/lib/color-scheme.mjs`, used by `Base.astro`) loads no `/theme.js` and adds the same meta.
  - With `true`, no color-scheme meta is added (unsure that `light dark` would change nothing visible, so nothing).
- **Tests.**
  - `packages/config`: `false` accepted without `colors.dark` (dark mirrors light); `true` and unset still require it.
  - `scripts/gen-theme.test.mjs`: no `.dark` block when false (inline snapshot); the block stays by default.
  - `apps/app/test/account-theme-render.test.tsx`: Akun preferences render without Tampilan when false (with a stored "dark", the scheme applied is light); with true, all three choices show and a stored "dark" applies.
  - `apps/site/test/color-scheme.test.ts` (the helper) and `build.test.ts` (the built HTML follows `brand.darkMode`).
- **Checked by hand.** With `darkMode: false` temporarily in `product.config.ts`, `pnpm theme` wrote no `.dark` in either CSS file, and a real `astro build` produced 8 pages, all without `theme.js` and all with `<meta name="color-scheme" content="light">`; the site's tests passed on that build. The config was then reverted and `pnpm theme` re-run (no diff in the CSS). The app web's meta was not checked in a browser, only in code and tests.
- **Products.** Myna Fit: set `brand.darkMode: false`, and `colors.dark` can go. `/theme.js` stays in `apps/site/public` (unused when false).

## D-077: The template's landing passes its own /design-review (2026-10-15)

- **Problem.** D-075's first run of `/design-review` on the template found:
  - two filled buttons in the landing's first viewport (header "Masuk" plus the hero CTA);
  - header links about 36 px tall, and the logo link 28 px;
  - three identical feature columns;
  - no "how it works" section and no closing CTA;
  - a hero CTA that isn't full width on phones;
  - dark `destructive` `#ef4444` with white text at 3.8:1, under WCAG's 4.5:1;
  - an example screen with no loading state, where a network error threw.
- **Decision.**
  - **Header** (`Base.astro`): "Masuk" is outlined, so each page's own CTA is the only filled button. Every header link has a 44 px target (`min-h-11`).
  - **Landing structure** (`index.astro`):
    1. hero with one primary CTA (full width and 48 px on phones), with "Lihat harga" as a text link;
    2. one problem in the reader's words, next to at most three mechanism points as a list, not cards;
    3. "Cara kerjanya" in three numbered steps;
    4. pricing;
    5. FAQ;
    6. a close that answers the last doubt, with the **same CTA label** as the hero (one `cta` constant).
    - There's no proof strip: the template has no true proof, and products add one only once they do.
    - The copy stays product-owned; the comment at the top gives the order.
  - **Dark `destructiveForeground`** is `#0b1120`, which gives 4.9:1 on `#ef4444`. The red stays light enough for error text on the dark background.
  - **Example screen:** the button shows "Memuat…" and is disabled while running, and a failed request shows the error text instead of throwing.
- **Tests.**
  - `apps/site/test/build.test.ts`: the closing CTA (`data-cta="close"`) has the hero's label (`data-cta="hero"`), skipped when a product drops the markers; the header has no filled button, and has 44 px targets.
  - Checked in Chromium at phone width (Pixel 7) and at 1280 px: header targets are 44 px; there's one filled button above the fold; the order is as above.

## D-078: D-074's tests hold in every product repo (2026-10-15)

- **Problem (Myna Fit, syncing `2d5f12d..65a6882`).** Two template tests failed in a product repo and blocked its `pnpm verify` and CI.
  - `consent-render.test.tsx` expected three checkboxes without mocking the config. In a product with `legal.consentStyle: "single"` the form rightly shows one.
  - `single-consent.test.tsx` used the example product's message keys (`quizExample.*`), which products remove, so it failed the typecheck. Myna Fit had to add a fixture file with those keys.
- **Decision.**
  - `consent-render.test.tsx` mocks `legal.consentStyle: "separate"`. It tests the separate-boxes rule; the single box stays covered by `single-consent.test.tsx`.
  - `single-consent.test.tsx` builds its quiz from core keys (`quiz.summary.*`, `quiz.next`). It compares the checkbox's label with `singleSentence()`, so a product's own `productConsent.single` passes too. The "names health data" check is left to the product's sentence.
  - `CLAUDE.md` (Definition of done): template tests use core message keys only, and mock `product.config` for a specific setting (as D-028 already asked of config).
  - `docs/TEMPLATE_SYNC.md` covers render tests in product repos: no `require()` at render time, and `expo-router` imported on the tap in slots. A template test that fails only in a product is a template bug, not a reason for product fixtures.
- **For Myna Fit.** After syncing this, delete `apps/app/src/features/i18n/template-fixtures.ts`.
- **Check.** Both tests pass on the template, with `quizExample` gone from `apps/app/test`. They were also run on a clone of Myna Fit's sync branch (`chore/sync-template-20261015`: `single` + `quiz_first` + `darkMode: false`, its own messages), with this branch's two test files and its fixture file deleted. The app typecheck passed, and so did all 56 app tests in 21 files.

## D-079: The sign-in email also carries a 6-digit code (`auth.emailCode`) (2026-10-15)

- **Problem (Myna Fit, on a real Android phone).** Erdi opened the magic link from the Gmail app. It signed him in inside Gmail's in-app browser. "Open in browser" then showed Chrome signed out: the session cookie stays in the webview's jar, and the one-time link can't be reused. This isn't a leak, but it costs conversion and trust, often minutes after paying. Installed home-screen apps on iOS (D-080) have their own cookie storage too.
- **Decision.** One email with both the link and a 6-digit code, and the code is typed where the visitor started. It's on by default; a product turns it off with `auth.emailCode: false`.
  - **Server** (`apps/api/src/core/auth.ts`). Better Auth's `emailOTP` plugin (docs read 2026-10-15, plugin source checked in 1.7.6):
    - `otpLength` 6, `expiresIn` 300 s, `allowedAttempts` 3 (then `TOO_MANY_ATTEMPTS`);
    - `storeOTP: "hashed"` (SHA-256);
    - its built-in rate limit on `/sign-in/email-otp` (3 per minute per IP) when rate limits are on.
    - Every other email-otp route is in `disabledPaths`, so codes can come only from the sign-in email.
  - **How both get into one email.** The docs don't say how email-otp and magic-link combine. So the code is created **in the magic-link send path**: one request, one email.
    - A resend deletes the previous code first, so there's one active code per address.
    - The code is written in the plugin's own stored format (`<sha256 base64url>:<attempts>` under `sign-in-otp-<email>`). The plugin's `createVerificationOTP` couldn't be called from inside the send path: the direct API call can't resolve the dynamic `baseURL`. `test/sign-in-code.test.ts` signs in with these codes, so a plugin format change fails the tests.
  - **Whichever is used first wins.** The send path also records which link goes with the code, as the link's hashed token. A session-create hook then deletes both the code and that link for the address. A used link ends the code, and a used code ends the link.
  - **Send limits.**
    - Better Auth's per-IP limit on `/sign-in/magic-link` (3 per minute).
    - New: **5 emails per address per 15 minutes**. Over the cap nothing is sent, and the answer is the same `{"status":true}`. Every address gets that answer (sign-up is open), so it can't probe which emails exist.
  - **The send is awaited.** The plugin advises against awaiting, but that advice is about timing revealing whether an account exists. Here every address gets an email, so timing says nothing, and a failure still shows "Gagal mengirim tautan".
  - **Email** (`magicLinkEmail`): "Ketuk tautan ini untuk masuk ke {name}, atau masukkan kode 482913 di halaman masuk.", the link, the code, and the rules (link 15 minutes, code 5 minutes, one cancels the other). An HTML version has the button in the product's primary colour and large, spaced digits. Indonesian and English. `wrangler dev` prints the code like the link.
  - **App** ("Cek email kamu", `core/auth/code-form.tsx`):
    - a 6-digit field (`inputMode="numeric"`, `autoComplete="one-time-code"`, `textContentType="oneTimeCode"`);
    - a pasted or suggested code signs in at once;
    - the address is shown, with "Ganti email";
    - "Kirim ulang" after 30 s (the same request, so a new code);
    - copy for a wrong or expired code, and for too many tries.
    - Signing in with the code only refreshes `/api/me`. The screen then continues exactly as after the link: the protected area's `afterSignIn`, `/consent` and the claim of anonymous data.
  - **Not done (optional in the request):** a note for people signed in inside a known in-app browser ("Mau lanjut di Chrome/Safari?"). The code already covers it; add the note if real use shows people need it.
- **Tests.**
  - API (`test/sign-in-code.test.ts`, 11 tests, skipped when the setting is off):
    - one request sends one email with a link and a 6-digit code (in the HTML too);
    - the code signs in with no cookies;
    - it's stored hashed;
    - after 3 wrong codes, the right one gets 403 `TOO_MANY_ATTEMPTS`;
    - an expired code gets `OTP_EXPIRED`;
    - a used link ends the code, and a used code ends the link;
    - a resend rotates the code;
    - over the per-address cap, the same answer comes back and nothing is sent;
    - known and unknown addresses get the same answer;
    - the plugin's send route returns 404.
  - App render (`test/sign-in-code-render.test.tsx`): numeric and one-time-code attributes, 6 max; a paste signs in; wrong and locked copy; resend cooldown; "Ganti email".
  - E2E (`sign-in-code.spec.ts`, config-agnostic):
    - the code typed in the browser that asked signs in, and the link opened in a context with no cookies then fails;
    - a wrong code shows the error and doesn't sign in, and the link still works in the same browser.
    - `sign-in.spec` ("a used magic link can't sign in twice") is unchanged and green.

## D-080: Installable web app, offered after payment (2026-10-15)

- **Problem (Myna Fit feedback, part 2).** People who paid open the product from a browser tab they lose. The app had no web app manifest, so Chrome never offered to install it, and iPhone users had no icon to add.
- **What the browsers need (read 2026-10-15).**
  - Chrome ([web.dev install criteria](https://web.dev/articles/install-criteria), updated 2024-09-19): `beforeinstallprompt` fires once the site isn't installed, the person has clicked once and viewed it for 30 s, it's on HTTPS, and the manifest has `name`/`short_name`, 192 and 512 px icons, `start_url`, `display` standalone (or fullscreen/minimal-ui), and no `prefer_related_applications`. No service worker is listed. [Chrome's blog](https://developer.chrome.com/blog/update-install-criteria) says the fetch-handler requirement was dropped (Chrome 108 Android, 112 desktop). [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable): a service worker is "not a requirement" to install.
  - iOS has no prompt API: Share → "Tambah ke Layar Utama". A manifest with `display: standalone` (or the `apple-mobile-web-app-capable` tag) makes it a Home Screen web app ([WebKit, iOS 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). It uses `apple-touch-icon` and has its own storage, so people sign in again inside it. The 6-digit code (D-079) makes that easy.
- **Decision.**
  - **No service worker.** No target browser needs one to install, and one we don't need would risk serving stale HTML or cached authenticated responses. `/sw.js` stays reserved for the app (one-domain check), and the CSP has no `worker-src`. If one is ever added, it must: never cache `/api/*` or authenticated responses; go network-first for HTML; cache only hashed `_expo` files; and ship a kill switch (a new version that unregisters itself).
  - **Generated by `pnpm theme`** from `product.config.ts` (products don't hand-edit them):
    - `apps/app/public/manifest.webmanifest`: `id` "/", `name`, `short_name` (`pwa.shortName` or the product name), `description` (tagline), `lang` (`locale.default`), `start_url` "/?source=pwa", `scope` "/", `display` standalone, `theme_color` = `brand.tokens.colors.light.primary`, `background_color` = its `background`, icons 192, 512 and maskable 512.
    - `apps/app/public/index.html`: Expo's own single-page template (copied from `@expo/cli` static/template), which `expo export` and `expo start` use when this file exists. It adds the manifest link, `theme-color`, a PNG favicon, `apple-touch-icon` and the Apple/mobile web-app tags, and `<html lang>` from the config (it was "en"). These are static on purpose: `expo-router/head` only adds tags once the bundle runs. Checked in a real `expo export`: `dist/index.html` has them, with Expo's script and CSS tags added.
    - **Icons from one source** (`pwa.icon`, default `apps/app/assets/icon.png`, product-owned, square PNG of at least 512 px, 1024 is best). The sizes are 192 and 512 (scaled, transparency kept); maskable 512 (`pwa.maskableIcon` if set, else the icon at 80 % on its own corner colour, or on the background colour if the corner is transparent); and `apple-touch-icon.png` 180 (opaque, because iOS shows transparent pixels black).
    - **No image dependency.** `sharp` is in the monorepo only as a transitive dependency (astro, miniflare), so the root can't import it. `scripts/png.mjs` (on `node:zlib`) reads 8/16-bit PNGs, scales down by area averaging with premultiplied alpha, and writes RGBA PNGs. `--check` compares decoded pixels, not bytes, so a different zlib build can't make `pnpm verify` fail.
    - The template's default icon is its logo (`apps/site/public/logo.svg`) drawn full-bleed at 1024 px.
    - `pwa.enabled: false`: the tags go and the manifest and icons are removed.
  - **Serving.** Workers static assets already send `application/manifest+json` for `.webmanifest` (checked with `wrangler dev`), so `_headers` needs no type rule. The CSP adds `manifest-src 'self'`.
  - **One domain (D-069).** `apps/site/test/one-domain.ts` counts the app's public files as app paths, plus `PWA_APP_PATHS` (manifest, `icons`, `apple-touch-icon.png`, `sw.js`) even before they exist. A site route over any of them fails the check.
  - **start_url and D-068.** Signed out on one domain, "/?source=pwa" redirects to `/mulai/?source=pwa`, keeping the query (test added). Signed in, it serves the app. `pwa_open` is tracked only when the app itself loads with `source=pwa`. A signed-out open lands on the landing page, which counts it as a page view.
  - **The offer** (`pwa.promptAfter`: "payment" | "first_result" | "never", default "never"):
    - "payment": a card under "Pembayaran berhasil" on core's billing return (also under a product's `billingReturn` slot).
    - "first_result": in core's `UpgradePrompt` (under the product's first result), signed-in users only. An iPhone home-screen app starts signed out, and a visitor's result would stay behind in Safari. Products may also render `InstallOffer` (`core/pwa/install-card`) elsewhere.
    - The card is one sentence (`pwa.offer`; products reword it with `productPwa.offer` in `features/messages.ts`, via `productMessage`), one primary button and "Nanti saja" (ghost). Targets are 44 px.
    - Android with a held `beforeinstallprompt` (`preventDefault`, so no mini-infobar): "Pasang" calls `prompt()`. A browser-dialog "no" counts as "Nanti saja".
    - iPhone/iPad (including iPadOS's Mac user agent with touch): "Pasang" opens a 3-step Share guide, with a note to sign in once more.
    - In-app browsers (UA contains `FBAN`, `FBAV`, `Instagram`, `Line/`, `GSA/` or `; wv)`): "Buka di Chrome/Safari untuk memasang", the link, and "Salin tautan" (Clipboard API, with a textarea fallback).
    - Nothing is shown when it's already installed (`display-mode: standalone` or `navigator.standalone`), when there's nothing to offer (desktop Firefox, Chrome before its event), or on native (`install-card.tsx` and `install.ts` are stubs; the logic is in `*.web.ts(x)`).
    - "Nanti saja" hides the card for 14 days (`core/kv`, `factory.pwa.dismissedAt`). Akun has "Pasang di HP" wherever installing is possible, whatever was dismissed.
  - **Analytics** (standard events in `@factory/core/analytics`): `pwa_prompt_shown`, `pwa_prompt_accepted` (tapped Pasang), `pwa_prompt_dismissed` (props `kind`, `placement`), `pwa_installed` (`appinstalled`) and `pwa_open`. They go through core `track()`, so the existing rules apply (OpenPanel in production only, no PII). None is mapped to the Meta Pixel.
- **Tests.**
  - `scripts/png.test.mjs`: codec, area averaging and fill.
  - `scripts/gen-theme.test.mjs`: every required manifest field; head tags only when enabled; icon sizes; config defaults. This product's generated files exist at the stated sizes, read from the PNG headers, with maskable present.
  - `apps/app/test/pwa-install-render.test.tsx`: Android with a captured event (`prompt()` called); the iOS guide; an in-app browser (copy link); standalone and unsupported browsers render nothing; placement gating; 14 days hidden; the Akun link; native stubs render nothing; the UA rules. `pwa.promptAfter` is mocked, and strings come from core keys.
  - `e2e/tests/pwa.spec.ts`: the manifest's JSON and content type, and the icons. Chrome's own `Page.getAppManifest` and `Page.getInstallabilityErrors` (CDP) report no errors, with no CSP violations. After a sandbox purchase, a dispatched `beforeinstallprompt` with a stubbed `prompt()` shows the card, "Pasang" calls `prompt()`, and "Nanti saja" keeps it hidden after a reload. That last test runs only with `promptAfter: "payment"`; it passed once with a temporary config, which was then reverted.
- **App test timeout.** `apps/app/vitest.config.ts` sets `testTimeout` to 20 s. Render tests re-import react-native-web for each case, and on a busy laptop (load around 25) `account-theme-render` and the new test went over the 5 s default.
- **Lighthouse.** Lighthouse 13.5.0 has no PWA category or manifest/installability audits any more (Chrome's docs mark PWA testing in Lighthouse as deprecated; none is in 13's audit list). On `/sign-in` served by `wrangler dev` it scored performance 82, accessibility 95, best practices 96 and SEO 63. Those scores aren't about installing, and the console error it flags is the unmigrated local D1. Installability was checked with Chrome's own signals instead: on Chromium 1243 (Playwright), `Page.getInstallabilityErrors` returned `[]` and `Page.getAppManifest` returned `[]` errors, with no service worker. The e2e test asserts this in every run.

## D-081: The payment success screen keeps one filled button when the install card shows (2026-10-15)

- **Problem.** D-080's review noted two filled buttons on "Pembayaran berhasil": core's "Ke beranda" and the install card's "Pasang". That breaks `/design-review`'s one-primary-per-viewport rule (D-075).
- **Decision.** `InstallOffer` takes `onShownChange`. While the card is on screen, "Ke beranda" is outlined, so "Pasang" is the one primary. Once the card is hidden ("Nanti saja", already installed, nothing to offer), "Ke beranda" is filled again. A product's `billingReturn` slot gets the same `InstallOffer` underneath and keeps its own buttons.
- **Test.** `pwa-install-render.test.tsx`: the callback reports `true` when the card shows and `false` after "Nanti saja".

## D-082: Nutrition numbers: label and curated data first, then a labelled and checked AI estimate (2026-10-15)

- **Problem (Myna Fit, real-phone testing).** Meal scans users couldn't trust:
  - siomay read as "semur";
  - an L-Men drink with "14 g protein" printed large on the front shown as 1 g;
  - snack nori with almost no protein.
  - The rule "numbers come only from curated data" pushed the product to drop an incomplete label and show the nearest curated food ("mirip: X") with confident, wrong numbers.
- **Decision (Erdi, product owner):** "user itu mau kepastian; estimasi juga bentuk kepastian, selama masuk akal". The guardrail becomes **hybrid** for every product (CLAUDE.md "Product guardrails"):
  1. **Sources in order.**
     - The photographed label, including front-of-pack claims.
     - Then curated data: branded products, then foods and recipes, on an exact or alias match only.
  2. **Otherwise an AI estimate**, only if it's:
     - labelled "Perkiraan AI";
     - plausibility-checked in code (a failing one shows "cek lagi" and asks the user to confirm or edit, never silently);
     - editable;
     - general information only (no medical claims, red flags still go to professionals).
  3. **No "similar food" fallback** with confident numbers for a different food.
  4. **Every number shows its source** (Label / Data kurasi / Perkiraan AI). Stored items keep the source and the model or dataset version.
- **`@factory/core/nutrition` `checkMacros({ grams, kcal, protein, carbs, fat }, options)`** returns `{ ok, problems[] }`:
  - finite, non-negative numbers and grams > 0;
  - grams within the kind's range (default 1–2000; products pass e.g. `[5, 500]` for snacks);
  - protein, carbs and fat each ≤ grams, and their sum ≤ grams;
  - kcal ≤ 900 per 100 g;
  - kcal within 25% (at least 25 kcal) of 4·P + 4·C + 9·F.

  Use it on AI estimates before showing them, and on labels read from photos (a misread digit fails too).
- **Where it's worded:** CLAUDE.md, FACTORY_BLUEPRINT.md, SPEC_TEMPLATE.md, `/build-from-spec`, `/spec-interview` and `/design-review` (rubric line F4).
- **Unchanged:** the scan pipeline stays product-owned. The AI adapter's contract (D-045: strict schema, server-side re-validation, no tools, budgets) doesn't change; D-083 and D-084 add providers.
- **Tests:** `packages/core/src/nutrition/index.test.ts` covers:
  - real foods pass (siomay, a protein drink, butter);
  - macros heavier than the item and impossible density are flagged;
  - an Atwater mismatch is flagged, with an absolute floor for small items;
  - the portion range is checked;
  - NaN, negative or zero values are rejected.
