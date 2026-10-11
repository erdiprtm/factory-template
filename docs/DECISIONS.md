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
  | sharp | 0.35.5 | 2026-10-12 |
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
