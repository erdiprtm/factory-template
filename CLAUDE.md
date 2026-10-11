# Factory template

This repo is the **factory template**: the sector-agnostic foundation that web-first (native-ready) products are generated from. It contains no product-specific code. Product repos are created from it with `/new-product` and keep pulling template updates (`docs/TEMPLATE_SYNC.md`).

> In a product repo, replace this section with: product name, one-liner, and a link to `specs/<slug>.md`.

The full design is in `FACTORY_BLUEPRINT.md`. Progress is in `docs/STATUS.md`, decisions in `docs/DECISIONS.md`.

## Ownership rule

**`core/` folders and everything in `packages/*` are template-owned. Product work must not edit them.** If a product needs a core change, make it in the template repo first, then sync it into the product.

| May edit in a product repo | Must not edit in a product repo |
|---|---|
| `apps/app/src/features/**` (incl. `messages.ts` for UI strings), `apps/api/src/features/**` (incl. `user-data.ts` export/delete hooks) | `apps/app/src/core/**`, `apps/api/src/core/**` |
| `product.config.ts`, `specs/**`, site content in `apps/site` | `packages/**` (core, db, ui, config) |
| `packages/db/src/features/**` (product tables + their migrations) | existing core tables or merged migrations |

## How to run

```sh
pnpm install          # once, and after pulling dependency changes
pnpm dev              # app (Expo web :8081) + API (wrangler dev :8787) locally
pnpm verify           # lint + migration safety + typecheck + test + build + e2e: must be green
pnpm db:generate      # new migration from schema changes (packages/db)
pnpm db:migrate:local # apply migrations to the local D1;  pnpm db:seed:local loads dev data
pnpm theme            # regenerate files derived from product.config.ts (theme CSS + the app's validated config JSON) after ANY config change
pnpm --filter @factory/site dev   # site at :4321 (SEO pages: add src/content/seo/<slug>.md)
```

- Migrations: see `packages/db/README.md`. Local only: `--local`. Remote databases are migrated **only by CI**.
- Local sign-in: magic links are printed in the `wrangler dev` log (no email is sent without `RESEND_API_KEY`).
- E2E needs Chromium once: `pnpm --filter @factory/e2e e2e:install`.
- Preview URL: open a PR. CI comments `https://pr-<n>-<slug>-preview.<subdomain>.workers.dev` on it after the smoke test.
- Native: `pnpm --filter @factory/app start` and scan the QR with Expo Go.

## Delivery flow (fully automated, no human approval)

1. Branch from `main` (`feat/…`, `fix/…`). Small conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
2. `pnpm verify` green locally.
3. `git push -u origin <branch>`, then `gh pr create --fill`, then `gh pr merge <n> --auto --squash`.
4. CI runs `verify` and `preview` (isolated preview Worker + D1, smoke test). When both pass, the PR auto-merges.
5. `main` deploys to production: D1 bookmark, migrations, deploy, smoke test. A failed smoke test auto-rolls back the Worker and opens an incident issue.
6. On an incident issue: fix forward in a new PR. Never re-run a failed deploy unchanged.

## Definition of done

- `pnpm verify` green (never claim success without running it).
- Tests added for new logic.
- All UI strings through i18n keys (`id` default, `en` secondary). No hardcoded copy.
- `docs/STATUS.md` updated. Non-trivial choices recorded in `docs/DECISIONS.md`.
- PR opened with a passing preview URL.

## Hard rules

- Ship to production **only through CI**. Never deploy, roll out, or delete from a laptop. `.claude/settings.json` and `.claude/hooks/guard-destructive.sh` enforce this. Don't weaken them, and don't work around them.
- No `deploy` script in any `package.json`. CI calls wrangler directly.
- Payment providers: **sandbox only**. No real payment keys in code or repo. No secrets in code: secrets live in `.dev.vars` (local, gitignored, human-filled) and Wrangler/GitHub secrets. Document every key in `.dev.vars.example`. Never read `.dev.vars`.
- Never bypass `requireAccess()` for paid features. Never weaken webhook signature verification.
- `apps/app` code must run on native: no browser-only APIs outside `*.web.tsx`. Native builds never show web prices or web checkout links.
- Migrations are expand/contract (`scripts/check-migrations.mjs`). Merged migrations are immutable. Destructive changes need `-- migration: contract` and a migration-only PR.
- Dependencies: latest stable published ≥ 14 days ago (`node scripts/pick-versions.mjs <pkg>`), pinned exactly, recorded in `docs/DECISIONS.md`. Expo-managed packages follow the Expo SDK's versions.
- Read current official docs before using an external API or library. Don't rely on memory.
- Write files that *mention* blocked commands (docs, workflows) with the Write/Edit tools. A Bash heredoc containing them is blocked by the guard hook.
- Ask the human only for what only a human can do: accounts, credentials, payments, legal, product decisions, and deleting cloud resources.

## Product guardrails (every product from this factory)

- Wellness, education, and information products give **general guidance, never diagnosis, prescriptions, or personalized medical, legal, or financial advice**. Health-adjacent products show a clear "bukan pengganti tenaga profesional" notice and route red-flag situations to professionals.
- Nutrition or health numbers shown to users come from **curated data stored in the product**, never from model memory. AI may phrase and combine; it must not invent facts or numbers.
- Tone: friendly, plain Bahasa Indonesia. Never shame users about their bodies, food, or habits.

## Playbooks (`.claude/skills/`)

| Command | When |
|---|---|
| `/new-product <spec> <slug>` | Start a new product repo from a complete spec (`scripts/new-product.mjs`, dry run first) |
| `/build-from-spec <spec>` | In a product repo: build v1 features (refuses incomplete specs: `scripts/spec-check.mjs`) |
| `/add-feature <desc>` | One more feature, product-owned folders only |
| `/add-plan <prices>` | Change plans/prices in `product.config.ts` and verify paywall + site |
| `/launch-check` | Pre-launch checklist (blueprint Section 11), pass/fail per item |
| `/sync-template` | Pull template updates into a product repo (`docs/TEMPLATE_SYNC.md`) |

## Where things are

```
apps/app        Expo app (web export now, iOS/Android later). src/core = template, src/features = product
apps/api        Hono Worker: /api/* + serves the app's web export. src/core = template, src/features = product
apps/site       Astro 7 site: landing, harga, SEO pages (src/content/seo), legal templates, OG images
packages/config product.config.ts schema (defineProduct)
packages/core   billing, entitlements, email, analytics, i18n (Phases 3–7)
packages/db     Drizzle schema + migrations (Phase 2)
packages/ui     Reusables-style NativeWind components (cn, Button, Card, Text, Input, Checkbox, Screen…)
scripts/        smoke test, migration gate, version picker, GitHub setup
.github/        pr.yml (verify + preview), deploy.yml (production + rollback)
docs/           STATUS, DECISIONS, SETUP_HUMAN (Bahasa Indonesia), later OPERATIONS, SPEC_TEMPLATE, TEMPLATE_SYNC
```
