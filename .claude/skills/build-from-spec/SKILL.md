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
- **Uploads from the web app:** the app's CSP blocks `fetch(blob:)`, so turn a picked file into base64 and then a `Blob` (or `FormData`) in memory before posting it (D-044, D-049).
- **User data (UU PDP):** every product table is exported and deleted with the account. Add it to `apps/api/src/features/user-data.ts` (`exportProductData`, `deleteProductData`), or give it `ON DELETE CASCADE` to `user.id` and still export it.
- **Site:** landing copy in `apps/site/src/pages/index.astro` (marked PRODUCT-OWNED), SEO pages in `apps/site/src/content/seo/` (served at `/artikel/<slug>/`).
- **The product's look, without touching `packages/ui` or `core/`:**
  - Tokens go in `product.config.ts` `brand.tokens` (D-052): colors, `radius` and `radii` per element, `controlHeight`, `shadow`, `density`, `weights`, and bundled `fonts`. Put the font files in `apps/app/assets/fonts/` and `apps/site/public/fonts/`. Then run `pnpm theme`.
  - Component variants go in `apps/app/src/features/theme.ts` (D-053): class overrides per Button variant/size/label, Card, Badge, Input and Text variant, merged last with `cn()`.
  - Core screens' look goes in `apps/app/src/features/slots.tsx` (D-054). The slots are `quizStep` (e.g. chat bubbles with a stepper for numbers), `quizSummaryHeader`, `quizSummaryBody`, `billingReturn`, `coreTabIcons`, `signInHeader`, `consentHeader`, `pricingIntro`, `planCard`, `tabItem` plus `tabBarClassName`, and `accountHeader`.
    - A slot gets display-ready props and returns UI only. Never re-implement consent checkboxes, the accept button, prices or access checks in a slot: core keeps them, and the rules can't be bypassed.
- **Sell engine (D-033 to D-038), from the spec's "Core loop & funnel":**
  - Quiz: replace the EXAMPLE in `apps/app/src/features/quiz.ts` (5–8 steps, strings in `features/messages.ts`), or set it to `null`.
  - The core action's API route uses `requireAccessOrFreeUse` (not `requireAccess`). If the action can fail without a real result (a blurry photo, an unclear input), use `checkAccessOrFreeUse` instead and call `const denied = await spendFreeUse(c); if (denied) return denied;` right before sending the result (D-056). Set `funnel.coreAction`, `freeUses` and `paywallPlacement` in `product.config.ts`.
  - When the screen shows its first result, call `reportFirstResult()` and render `<UpgradePrompt />` under it. A 402 renders `<Paywall reason=… />`.
  - Landers: one file per ad hook in `apps/site/src/content/landers/`, with `hook` equal to the ad's hook word for word. Replace `contoh.md`.
  - Follow the ad guardrails in `CLAUDE.md`.
  - Photo or file uploads: list the route in `apps/api/src/features/uploads.ts` (bytes, capped at 5 MB; default 64 KB) and read it with `readImageUpload(c)` from `src/core/uploads` (D-044). Resize on the device first.
  - AI/vision calls (D-045): set `ai` in `product.config.ts`, then in the route `sessionMiddleware` → `requireAiBudget` → `requireAccessOrFreeUse` → `runAi(c, aiProvider(c.env, mock), "<feature>", { system, text, image, schema, maxOutputTokens })` from `src/core/ai`. Handle every failure (`quota` and `unavailable` show a retry message), and give a realistic `mock` so E2E runs without a key. The model recognises or extracts; numbers shown to users still come from curated data. Several AI features with different costs (a photo scan next to cheap typed-text parsing): cap each with `requireAiBudgetFor("<feature>", <per day>)` in place of `requireAiBudget`, with the same name `runAi` gets, and set `ai.perUserPerDay` to the total across features (D-050).
  - Main screens as tabs: `apps/app/src/features/nav.ts` (≤ 4; core adds Akun, D-048).
  - Users' files (photos, documents): `saveFile(db, c.env.FILES, { userId, feature, bytes, contentType })` from `@factory/core/files`; keep the returned id in the product's row; the app shows it from `/api/files/<id>` (owner only). Store the small version you need; the server doesn't resize (D-049).
  - Retention and other recurring jobs: `apps/api/src/features/scheduled.ts` (`runProductScheduled`, D-046).
  - New packages a feature needs: add them to `apps/app` / `apps/api` (`expo install` for Expo packages, else `pick-versions`), record them in `docs/DECISIONS.md` (D-047).
  - "Pay for proof" (the first result BEFORE signup, D-042): set `funnel.anonymousFreeUses` (≤ `freeUses`). Put the core action's route behind `sessionMiddleware` + `requireAccessOrFreeUse` without `requireSession`, and its screen outside the `(app)` group. Store anonymous results with `anonIdOf(c)`, and move them to the account in `claimAnonymousData` (`apps/api/src/features/user-data.ts`). A 401 `sign_up_required` means "save and sign up"; `<UpgradePrompt />` already shows that for visitors.
    - Set `funnel.anonymousEntry` to that public screen's path (e.g. `/scan`): the quiz leads there instead of to sign-in (D-043). The route file is a thin re-export at `apps/app/src/app/<entry>.tsx` (outside `(app)`) of a screen in `src/features/**`, wrapped in `<AnonymousConsentGate>` (`src/core/auth/anonymous-consent`).
    - A visitor must consent on the device before the first use (D-043): the gate asks, the API refuses with 403 `consent_required` otherwise, and the consent moves to the account at sign-in. Delete unclaimed anonymous results within `ANONYMOUS_CONSENT_DAYS` (90).
- **Health/nutrition numbers** come only from curated data stored in the product, never from model memory.
- Replace the home screen (`src/app/(app)/index.tsx`) with the product's main feature, and delete the example feature once a real paid feature exists: `apps/api/src/features/example.ts` and its mount, `apps/app/src/features/example/`, `src/app/(app)/example.tsx`, the `example.*` / `home.openExample` strings. Template tests don't depend on either (D-032).

If a change is needed in `core/` or `packages/*` (other than `db/src/features`), stop: that is a **template bug**. Note it in STATUS and make the fix in the template repo first.

## 3. Test and ship
- Add unit/integration tests per feature, and extend `e2e/` for the paid path.
- `pnpm verify` must be green.
- Branch, then `gh pr create --fill`, then `gh pr merge --auto --squash`. Report the preview URL from the PR comment.
- Update `docs/STATUS.md`, and `docs/DECISIONS.md` for non-trivial choices.
