# Pulling template updates into a product repo

Product repos are created from the factory template (`/new-product`) and keep receiving its improvements: security fixes, billing changes, new core features. The **ownership rule** (CLAUDE.md) keeps these merges small. The template owns `core/` folders and `packages/*`; the product owns `features/`, `product.config.ts`, `specs/` and site content.

## One-time setup (in the product repo)

```sh
git remote add template https://github.com/<owner>/factory-template.git
git fetch template
```

GitHub's "create from template" gives the product a fresh history. The first sync therefore needs `--allow-unrelated-histories`; later syncs merge normally.

## Each sync (`/sync-template`)

```sh
git fetch template
git switch -c chore/sync-template-YYYYMMDD origin/main
git merge template/main --no-ff            # first time: add --allow-unrelated-histories
pnpm install && pnpm theme && pnpm verify
gh pr create --fill && gh pr merge --auto --squash
```

Never rebase or force-push. The `main` ruleset forbids it, and merges keep the history auditable.

## Resolving conflicts

| Path | Who wins | Notes |
|---|---|---|
| `apps/*/src/core/**`, `packages/**` (except `packages/db/src/features/**`) | Template | Product code must not have edited these. If it did, that's a template bug to upstream |
| `scripts/**`, `.github/**`, `.claude/**` | Template | |
| `apps/*/src/features/**`, `packages/db/src/features/**` | Product | |
| `product.config.ts` | Product values | Accept new *fields* the template added (they have defaults in the schema) |
| `specs/**`, `factory.json`, site SEO content and landing copy | Product | |
| `packages/db/migrations/*.sql` | Both | Timestamp prefixes never collide. Keep all files, then `pnpm db:generate` must report no changes |
| `packages/db/migrations/meta/*` | Regenerate | Take the template's version, then `pnpm db:generate` rebuilds the snapshot including product tables |
| `pnpm-lock.yaml` | Regenerate | Take either side, then `pnpm install` |
| `CLAUDE.md` | Template | Keep the product's header section at the top |

## When the product needs a core change

1. Make the change in the **template** repo, as a normal PR with tests.
2. Run `/sync-template` in the product.

Don't patch `core/` in a product repo, even "temporarily": the next sync will conflict or silently revert it.
