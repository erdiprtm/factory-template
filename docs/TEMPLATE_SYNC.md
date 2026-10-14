# Pulling template updates into a product repo

Product repos are created from the factory template (`/new-product`) and keep receiving its improvements: security fixes, billing changes, new core features. The **ownership rule** (CLAUDE.md) keeps these merges small. The template owns `core/` folders and `packages/*`; the product owns `features/`, `product.config.ts`, `specs/` and site content.

## One-time setup (in the product repo)

```sh
git remote add template https://github.com/<owner>/factory-template.git
git fetch template
```

GitHub's "create from template" gives the product a fresh history, and sync PRs are squash-merged, so the product never shares history with the template. `/new-product` therefore writes **`.template-version`**: the template commit the repo starts from (D-061). Each sync applies the template's diff since that commit and records the new one.

## Each sync (`/sync-template`)

```sh
git fetch template
git switch -c chore/sync-template-YYYYMMDD origin/main
node scripts/template-sync.mjs              # applies .template-version..template/main (3-way), updates it
pnpm install && pnpm theme && pnpm verify
gh pr create --fill && gh pr merge --auto --squash
```

Never rebase or force-push. The `main` ruleset forbids it, and merges keep the history auditable.

## Resolving conflicts

| Path | Who wins | Notes |
|---|---|---|
| `apps/*/src/core/**`, `packages/**` (except `packages/db/src/features/**`) | Template | Product code must not have edited these. If it did, that's a template bug to upstream |
| `scripts/**`, `.github/**`, `.claude/**`, `factory.secrets.json` | Template | `factory.secrets.json` lists only shared infra secrets (D-066). A product's own secrets are set per repo |
| `apps/*/src/features/**`, `packages/db/src/features/**` | Product | Includes `theme.ts` (component variants, D-053) and `slots.tsx` (core screens' look, D-054). A template change to their *types* (`@factory/ui` `UiVariants`, `core/slots.ts`) only adds optional fields |
| `product.config.ts` | Product values | Accept new *fields* the template added (they have defaults in the schema) |
| `specs/**`, `factory.json`, site SEO content and landing copy | Product | |
| `packages/db/migrations/*.sql` | Both | Timestamp prefixes never collide. Keep all files, then `pnpm db:generate` must report no changes |
| `packages/db/migrations/meta/*` | Regenerate | Take the template's version, then `pnpm db:generate` rebuilds the snapshot including product tables |
| `apps/*/package.json` `dependencies` / `devDependencies` | Both (D-047) | Keep the template's versions for the packages it lists, plus the product's own additions (recorded in the product's `docs/DECISIONS.md`). Scripts and every other field: template |
| `pnpm-lock.yaml` | Regenerate | Take either side, then `pnpm install` |
| `apps/app/global.css`, `apps/site/src/styles/tokens.css`, `apps/app/src/core/product.generated.json`, `apps/app/src/core/fonts.generated.ts` | Regenerate | Take either side, then `pnpm theme`: they are generated from the product's `product.config.ts` |
| `apps/app/assets/fonts/**`, `apps/site/public/fonts/**` | Product | The product's bundled font files (D-052) |
| `CLAUDE.md` | Template | Keep the product's header section at the top |

## When the product needs a core change

1. Make the change in the **template** repo, as a normal PR with tests.
2. Run `/sync-template` in the product.

Don't patch `core/` in a product repo, even "temporarily": the next sync will conflict or silently revert it.
