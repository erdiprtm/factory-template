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
