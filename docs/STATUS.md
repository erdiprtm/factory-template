# Status

Progress log, newest entry on top.

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
