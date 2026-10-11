---
name: build-from-spec
description: Build a product's v1 features from its spec in specs/, inside product-owned folders only, and ship via PR with a preview URL. Use in a product repo after /new-product.
argument-hint: <specs/slug.md>
disable-model-invocation: true
---

# /build-from-spec

Build the product described in `$ARGUMENTS`.

## 0. Gate
- Run `node scripts/spec-check.mjs $ARGUMENTS`. If it fails, **refuse to start**. Tell the human exactly which sections are missing (**Core features**, **Paid vs free**, **Data the product stores**, **Kill criteria**) and ask them to fill them in.
- If the spec stores sensitive data (health, children, finance, location), set `legal.sensitiveDataConsent: true` in `product.config.ts` and describe the data in `legal.productDataDescription`.

## 1. Plan
Write `specs/<slug>.plan.md`: one section per core feature (max 3) covering screens, API routes, tables, which parts are paid (behind `requireAccess`), the `feature_*` analytics events, and tests. Keep it short.

## 2. Build only in product-owned places (ownership rule, CLAUDE.md)
- **API:** `apps/api/src/features/<feature>.ts` (Hono sub-app), mounted in `src/index.ts` next to the example. Paid routes use `sessionMiddleware` + `requireAccess`.
- **Tables:** `packages/db/src/features/<feature>.ts`, exported from `features/index.ts`. Then `pnpm db:generate`, rename the migration, `pnpm db:migrate:local`. Expand-only.
- **App:** `apps/app/src/features/<feature>/`, plus a route file in `src/app/(app)/`. Use `@factory/ui` components and `useI18n()`. Put the feature's strings in `apps/app/src/features/messages.ts` (both `id` and `en`, feature-prefixed keys), never in `src/core/i18n`. No browser-only APIs outside `*.web.tsx`.
- **User data (UU PDP):** every product table is exported and deleted with the account. Add it to `apps/api/src/features/user-data.ts` (`exportProductData`, `deleteProductData`), or give it `ON DELETE CASCADE` to `user.id` and still export it.
- **Site:** landing copy in `apps/site/src/pages/index.astro` (marked PRODUCT-OWNED), SEO pages in `apps/site/src/content/seo/`.
- **Health/nutrition numbers** come only from curated data stored in the product, never from model memory.
- Replace the home screen (`src/app/(app)/index.tsx`) with the product's main feature, and delete the example feature once a real paid feature exists: `apps/api/src/features/example.ts` and its mount, `apps/app/src/features/example/`, `src/app/(app)/example.tsx`, the `example.*` / `home.openExample` strings. Template tests don't depend on either (D-032).

If a change is needed in `core/` or `packages/*` (other than `db/src/features`), stop: that is a **template bug**. Note it in STATUS and make the fix in the template repo first.

## 3. Test and ship
- Add unit/integration tests per feature, and extend `e2e/` for the paid path.
- `pnpm verify` must be green.
- Branch, then `gh pr create --fill`, then `gh pr merge --auto --squash`. Report the preview URL from the PR comment.
- Update `docs/STATUS.md`, and `docs/DECISIONS.md` for non-trivial choices.
