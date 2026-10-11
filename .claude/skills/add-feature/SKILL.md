---
name: add-feature
description: Add one feature to an existing product following the ownership rule (product-owned folders only), with tests and a PR.
argument-hint: <short feature description>
disable-model-invocation: true
---

# /add-feature

Add: $ARGUMENTS

1. Re-read the product's spec in `specs/`. If the feature changes what's paid or what data is stored, update the spec first and confirm with the human.
2. Place code only in product-owned locations:
   - `apps/api/src/features/`
   - `packages/db/src/features/`
   - `apps/app/src/features/` (plus a route file under `src/app/(app)/`)
   - site content

   Never edit `core/` or `packages/*` (other than `db/src/features`). If you need to, it's a template change: stop and say so.
3. Paid functionality goes behind `requireAccess()` on the API. The app shows `<Paywall />` on 402. Native builds never show prices or web checkout links.
4. Migrations are expand-only (`scripts/check-migrations.mjs`). All UI strings are i18n keys (`id` + `en`). Analytics events are named `feature_<name>` with no PII.
5. Write tests (Vitest for logic and API, Playwright for the user path), run `pnpm verify`, then open a PR with auto-merge.
