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
                                            # exit 2 = conflicts and/or "Apply by hand" paths to finish; exit 1 = nothing applied (D-070)
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
| `packages/db/migrations/meta/*` | Merge (D-093) | **Never take one side whole.** With product migrations, the template's `_journal.json` drops the product's entries, and its new snapshot lacks the product tables, so `db:generate` would emit a duplicate migration that recreates them. Instead: (1) `_journal.json`: keep every entry from both sides, sorted by `tag` (the timestamp prefix), with `idx` renumbered 0, 1, 2…; (2) each new template snapshot: add the product's tables from the product's latest snapshot, and set its `prevId` to that snapshot's `id`; (3) `pnpm db:generate` must report "No schema changes, nothing to migrate" |
| `apps/*/package.json` `dependencies` / `devDependencies` | Both (D-047) | Keep the template's versions for the packages it lists, plus the product's own additions (recorded in the product's `docs/DECISIONS.md`). Scripts and every other field: template |
| `pnpm-lock.yaml` | Regenerate | Take either side, then `pnpm install` |
| `apps/app/global.css`, `apps/site/src/styles/tokens.css`, `apps/app/src/core/product.generated.json`, `apps/app/src/core/fonts.generated.ts` | Regenerate | Take either side, then `pnpm theme`: they are generated from the product's `product.config.ts` |
| `apps/app/assets/fonts/**`, `apps/site/public/fonts/**` | Product | The product's bundled font files (D-052) |
| `apps/app/assets/icon.png` (or the product's `pwa.icon` / `pwa.maskableIcon`) | Product | The installable app's source icon (D-080) |
| `apps/app/public/index.html`, `manifest.webmanifest`, `apple-touch-icon.png`, `icons/**` | Regenerate | Take either side, then `pnpm theme` (D-080) |
| `CLAUDE.md` | Template | Keep the product's header section at the top |

## Files the sync leaves to the product (D-088)

- **`docs/STATUS.md`** is each repo's own progress log. `scripts/template-sync.mjs` never applies the template's changes to it and prints `skipped: docs/STATUS.md (product-owned)`. `docs/DECISIONS.md` still syncs: template decisions explain template code.
- **Privacy page (`apps/site/src/content/legal/privasi.md`)** is product content, but keep the line `{{aiProcessor}}` on a line of its own. The template fills it from `ai.provider` (D-083, D-084), and `apps/site/test/legal.test.ts` checks it's there, so a rewritten page without it fails the sync's verify. Myna Fit keeps its own processor table and adds the line under it. The same goes for `{{paymentProcessor}}` (its own line in `privasi.md`) and `{{paymentProcessorName}}` (in `syarat.md`), filled from `payments.provider` (D-092): replace a hand-written "Duitku" with them, and the test fails if a provider name is hard-coded.
- **Tab labels** are the product's (`apps/app/src/features/nav.ts`), `/account` included ("Profil", "Akun"…). Template tests find tabs by target (`nav-account`, D-087), never by label.

## Render tests in a product repo (D-058, D-078)

The template's app tests render React Native components in jsdom: `react-native` → react-native-web, with `react-native-svg` stubbed. Two things in product code break them:

- **`require()` at render time.** `require` bypasses vitest's aliases, so the real `react-native-svg` loads and fails with "Unexpected token 'typeof'". Use plain `import`s.
- **`expo-router` in a slot.** It can't be loaded in tests at all. A slot that navigates imports it on the tap: `onPress={async () => (await import("expo-router")).router.push("/x")}`.

If a template test fails only in your product, it's a template bug: report it (template tests must hold in every product, whatever its config and messages), rather than adding fixtures to the product.

## When the product needs a core change

1. Make the change in the **template** repo, as a normal PR with tests.
2. Run `/sync-template` in the product.

Don't patch `core/` in a product repo, even "temporarily": the next sync will conflict or silently revert it.
