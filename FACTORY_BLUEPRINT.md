# Autonomous Software Factory — Blueprint v1

> **Cara pakai (untuk Erdi):**
> 1. Buat folder kosong, misal `~/dev/factory-template`, lalu taruh file ini di dalamnya.
> 2. Buka Claude Code di folder itu.
> 3. Kirim prompt: **"Baca FACTORY_BLUEPRINT.md sampai habis. Jalankan Phase 0, lalu lanjut phase demi phase. Berhenti di setiap checkpoint HUMAN."**
> 4. Setiap kali Claude Code berhenti di checkpoint 🧑 HUMAN, kerjakan yang diminta, lalu bilang "lanjut".
>
> Dokumen di bawah ditulis dalam bahasa Inggris supaya instruksinya presisi untuk agent.

---

## 0. Mission

Build a **reusable template repository** ("the factory template") from which many web-app products can be generated quickly by an AI coding agent, with minimal human involvement.

The template must be **sector-agnostic**. It will power health/wellness products, sports, education, and anything else. **Nothing product-specific goes into the template.** No food databases, no mascots, no domain logic. Those belong to product repos forked from the template.

Every product generated from the template is:
- A **web app first**, built so that **iOS and Android apps can ship later from the same codebase**, using a **web-to-app funnel** (acquire and convert on the web, then the user installs the app and signs in with the same account). Indonesian market first, Bahasa Indonesia default, English secondary.
- Monetized by **one prepaid subscription** with two durations: **6 months** and **12 months**, paid via **Duitku** (QRIS + e-wallets + virtual account; DOKU kept as a second adapter). No auto-renew; renewal is a new purchase that extends access.
- Offers a **free trial** (default 7 days, configurable, once per user).

### The six factory components (all must exist when v1 is done)

| # | Component | Lives in |
|---|---|---|
| 1 | Template (the foundation code) | `apps/*`, `packages/*` |
| 2 | Standard product spec format | `docs/SPEC_TEMPLATE.md`, `specs/` |
| 3 | Agent playbooks | `CLAUDE.md`, `.claude/skills/*` |
| 4 | Automated quality gates | `pnpm verify`, CI workflows, tests |
| 5 | Launch kit | `apps/site` (landing, pricing, SEO pages, legal pages) |
| 6 | Portfolio visibility | `factory.json` registry, per-product `/admin` metrics, analytics |

---

## 1. Operating rules for the agent (read before doing anything)

1. **Work phase by phase.** Do not start a phase until the previous phase's acceptance criteria pass. Log progress in `docs/STATUS.md` (date, phase, what was done, what's next).
2. **Stop at every 🧑 HUMAN checkpoint.** State exactly what the human must do, in plain Bahasa Indonesia, step by step, with links. Then wait.
3. **Verify, don't assume.** Before using any external API or library (Duitku, DOKU, Better Auth, Cloudflare, Drizzle, OpenPanel, Sentry, Expo, NativeWind, Astro), read its **current official documentation**. Do not rely on memory for API shapes, config keys, or signatures.
4. **Versions.** Use the latest stable version of each dependency that was published **at least 14 days ago**. Pin exact versions (no `^`/`~`). Record chosen versions and why in `docs/DECISIONS.md`.
5. **Never done until green.** A task is complete only when `pnpm verify` passes. Never claim success without running it.
6. **Fully automated delivery, no human approval.** The agent commits, pushes, opens PRs, and merges to `main` on its own once `pnpm verify` and CI pass. Merging to `main` deploys to production automatically. Automated safeguards replace human approval (see Phase 1): every gate must pass, a post-deploy smoke test runs, and a failed smoke test triggers an automatic rollback to the previous version.
   - Configure Claude Code so routine commands (git, gh, pnpm, wrangler) run without permission prompts, using an allowlist in the project's `.claude/settings.json` per the current Claude Code permissions docs. Keep destructive commands (e.g. deleting databases or buckets, force-pushing `main`, rewriting history) **denied**.
7. **Never use real payment credentials.** Payment-provider sandbox only, until the human explicitly switches a product to production.
8. **Secrets** live in `.dev.vars` (local, gitignored) and Wrangler secrets (deployed). Never commit secrets. Provide `.dev.vars.example` with every key documented.
9. **Decisions.** Any non-trivial choice (library, pattern, trade-off) gets a short entry in `docs/DECISIONS.md`: context, decision, alternatives considered.
10. **Small, conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
11. **Code and comments in English. User-facing copy in Bahasa Indonesia by default**, via i18n keys (never hardcode UI strings).
12. **Ask the human only when blocked** by something only a human can do (accounts, credentials, payments, legal, product decisions). Otherwise make a reasonable decision, document it, and continue.

---

## 2. Final stack (decided — do not substitute without a DECISIONS.md entry)

| Role | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | |
| Language | TypeScript (strict) everywhere | |
| App frontend | Expo + React Native + **React Native Web**, Expo Router (+ TanStack Query) | One codebase → web now, iOS/Android later. Web build is a static export |
| Styling | NativeWind + React Native Reusables | Same components on web and mobile. Design tokens per product, shared with the site's Tailwind config |
| Marketing/SEO site | Astro (static output) + Tailwind | Landing, pricing, SEO content pages, legal pages |
| API | Hono on Cloudflare Workers | Export typed client via Hono RPC |
| Hosting | Cloudflare Workers (static assets for the app's web export) | One Worker serves the web app + `/api/*` on the same origin |
| Database | Cloudflare D1 + Drizzle ORM + drizzle-kit migrations | Keep queries portable to Postgres (no SQLite-only tricks) |
| Object storage | Cloudflare R2 | Signed upload/download via API |
| Auth | Better Auth | Google OAuth + email magic link now. Must also support native clients later (token/secure-storage sessions, e.g. Better Auth's Expo integration; verify in docs) and **Sign in with Apple** before any iOS release |
| Validation | Zod (shared between API and web) | |
| Payments | Duitku (POP hosted payment page) behind a provider-agnostic interface | Sandbox first. DOKU Checkout as the second adapter (Phase 9) |
| Scheduled jobs | Cloudflare Cron Triggers | Renewal reminders, pending-payment expiry |
| Email | Provider adapter. Use Cloudflare's email sending if generally available on the account; otherwise Resend | Agent checks current availability and documents the choice |
| Product analytics | OpenPanel | |
| Error monitoring | Sentry (browser + Cloudflare Workers SDKs) | |
| Lint/format | Biome | |
| Tests | Vitest (unit + Workers integration via Cloudflare's Vitest pool), Playwright (E2E) | |
| CI/CD | GitHub Actions + Wrangler | Preview deploys on PR, auto-merge when green, automatic production deploy with smoke test and auto-rollback |

**Not in v1** (do not build yet): App Store / Play Store builds and releases, in-app purchases (Adapty or RevenueCat), push notifications, multi-currency, auto-renew billing, marketplace/split payments. **But v1 must be native-ready:** the app code must not depend on browser-only APIs outside of `*.web.tsx` files, auth must be designed for native clients, and entitlements must accept store purchases as a source (see Section 6b and Phase 10).

---

## 3. Repository layout

```
factory-template/
├── apps/
│   ├── app/                 # Expo app (web now; iOS/Android later from the same code)
│   │   └── src/
│   │       ├── core/        # template-owned: layout, auth screens, account, paywall
│   │       └── features/    # PRODUCT-OWNED: empty in template except an example
│   ├── api/                 # Hono Worker (also serves the apps/app web export as static assets)
│   │   └── src/
│   │       ├── core/        # template-owned: auth, billing, webhooks, admin, health
│   │       └── features/    # PRODUCT-OWNED
│   └── site/                # Astro marketing + SEO + legal pages
├── packages/
│   ├── core/                # template-owned shared logic: billing, entitlements, email, analytics, i18n
│   ├── db/                  # Drizzle schema (core tables) + migrations
│   ├── ui/                  # React Native Reusables + NativeWind components + design tokens
│   └── config/              # product.config.ts loader + types
├── product.config.ts        # THE file a new product edits first
├── factory.json             # portfolio registry (see Phase 8)
├── specs/                   # product specs (one .md per product/feature)
├── docs/
│   ├── SPEC_TEMPLATE.md
│   ├── STATUS.md
│   ├── DECISIONS.md
│   ├── SETUP_HUMAN.md       # step-by-step account setup for the human, in Bahasa Indonesia
│   └── TEMPLATE_SYNC.md     # how product repos pull template updates
├── .claude/
│   └── skills/              # agent playbooks (each becomes a /command)
├── CLAUDE.md
└── .github/workflows/
```

### Ownership rule (critical for template sync)

- `core/` folders and `packages/*` are **template-owned**. Product work must not edit them. If a product needs a core change, the change is made in the template repo first, then pulled into the product.
- `features/` folders, `product.config.ts`, `specs/`, and site content are **product-owned**.
- Product-specific database tables go in `packages/db/src/features/` with their own migrations, never by altering core tables.

---

## 4. `product.config.ts` (single source of product identity)

Everything that differs between products and is not feature code lives here. Typed and validated with Zod at build time.

```ts
export default defineProduct({
  slug: "example",                // used in DB, analytics, registry
  name: "Example Product",
  tagline: "…",
  locale: { default: "id", supported: ["id", "en"] },
  domain: { app: "app.example.com", site: "example.com" }, // workers.dev until a domain exists
  brand: { tokens: { /* colors, radius, font families */ }, logo: "/logo.svg", favicon: "/favicon.svg" },
  trial: { enabled: true, days: 7 },
  plans: [
    { id: "6m",  label: "6 bulan",  months: 6,  priceIdr: 149000 },
    { id: "12m", label: "12 bulan", months: 12, priceIdr: 249000, highlight: true },
  ],
  payments: {
    provider: "duitku",                // "duitku" | "doku"
    methods: ["QRIS", "DANA", "SHOPEEPAY", "OVO", "VIRTUAL_ACCOUNT"], // map to the provider's current method codes
  },
  legal: { companyName: "PT …", contactEmail: "…", sensitiveDataConsent: false },
  admin: { emails: ["…"] },       // allowlist for /admin
});
```

`sensitiveDataConsent: true` turns on an extra explicit consent step at signup (for products that store health-related or otherwise sensitive personal data under UU PDP).

---

## 5. Core data model (template-owned)

Better Auth manages its own tables (user, session, account, verification). Generate them with Better Auth's Drizzle tooling and keep them in `packages/db`. Add these core tables:

| Table | Key columns | Purpose |
|---|---|---|
| `payments` | id, user_id, provider, provider_ref (unique), plan_id, amount_idr, status (`pending`/`paid`/`failed`/`expired`), created_at, paid_at, raw_payload | One row per checkout attempt |
| `entitlements` | id, user_id, source (`trial`/`payment`/`admin_grant`/`app_store`/`play_store`; store sources unused until Phase 10), plan_id, starts_at, expires_at, payment_id | Access periods. A user has access if any row has `expires_at > now` |
| `webhook_events` | id, provider, event_key (unique), received_at, processed_at, status | Idempotency for webhooks |
| `consents` | id, user_id, type (`terms`/`privacy`/`sensitive_data`/`marketing`), version, granted_at, revoked_at | UU PDP consent record |
| `reminders_sent` | id, user_id, entitlement_id, kind (`d7`/`d1`/`expired`), sent_at | Prevent duplicate reminder emails |

All amounts are **integer IDR**. All timestamps are stored as UTC and displayed in `Asia/Jakarta`.

### Entitlement rules

- **Access check:** `hasAccess(userId) = exists entitlement where expires_at > now`. Expose it as a single core function plus an API middleware `requireAccess()`.
- **Trial:** granted once per user on first eligible action (configurable: on signup or on "Mulai trial" click). Source `trial`.
- **Purchase extends, never overlaps:** `new.starts_at = max(now, latest_expires_at)` and `new.expires_at = starts_at + plan.months`. Buying early never loses days.
- **Admin grant:** `/admin` can grant N days manually (for support and partners). Source `admin_grant`.

---

## 6. Payment flow (provider-agnostic, Duitku first)

Define a `PaymentProvider` interface in `packages/core/billing`:

```ts
interface PaymentProvider {
  createCheckout(input: { paymentId: string; amountIdr: number; planId: string;
    customer: { name: string; email: string }; methods: string[];
    successUrl: string; failureUrl: string; expiresInMinutes: number }): Promise<{ redirectUrl: string; providerRef: string }>;
  verifyWebhook(request: Request): Promise<{ eventKey: string; providerRef: string; status: "paid" | "failed" | "expired"; raw: unknown } | null>;
}
```

Implement `DuitkuProvider` using **Duitku POP** (Create Invoice API, then redirect to Duitku's hosted payment page, which lists QRIS, e-wallets, and VA). Read Duitku's current API docs (docs.duitku.com) for request signing, callback format, and callback signature verification. Do not guess them. Also call Duitku's transaction status API to confirm a payment before granting access, rather than trusting the callback body alone.

**Flow:**
1. `POST /api/billing/checkout { planId }` → requires login → creates a `payments` row (`pending`) → calls `createCheckout` → returns `redirectUrl`.
2. User pays on the provider's hosted page.
3. The provider calls `POST /api/webhooks/<provider>` → `verifyWebhook` (reject on bad signature, return 401) → insert into `webhook_events` (unique `event_key`; if duplicate, return 200 and stop) → update payment → if `paid`, create entitlement per the rules above → send receipt email → return 200.
4. User returns to `/billing/return` → page polls `GET /api/billing/status?paymentId=…` until `paid`, `failed`, or timeout, then shows the result.
5. Cron marks `pending` payments older than their expiry as `expired`.

**Required tests:** signature rejection, duplicate webhook idempotency, extension math (early renewal, renewal after expiry), trial-once rule, access middleware.

Adding Xendit or Midtrans later must only require a new class implementing `PaymentProvider` and a config switch.

---

## 6b. Web-to-app funnel (design now, ship native in Phase 10)

The business model: **acquire and convert on the web, deliver everywhere.**

1. User finds the product via SEO, content, or ads → lands on `apps/site`.
2. Signs up and starts the trial, or pays, **on the web** (Duitku, near-zero fees).
3. After signup or payment, the web app shows "Lanjut di aplikasi" with App Store / Play Store links (once apps exist) and tells the user to **sign in with the same account**.
4. In the native app, the user signs in → the API returns their entitlement → access is granted. **The entitlements table is the single source of truth** for web and app.

Rules the template must respect from v1:
- **One account everywhere.** Auth identities (Google, email, later Apple) must resolve to the same user across web and native.
- **Entitlements are store-agnostic.** Access checks never ask "where did they pay", only "is there an active entitlement".
- **Store rules (for Phase 10).** Apple requires that digital content sold inside an iOS app also be purchasable via in-app purchase, and outside the US you may not link or point users from inside the app to web checkout. Google Play has its own billing rules (User Choice Billing is available in Indonesia). The agent must read the current App Store Review Guidelines and Google Play payments policy before Phase 10 and document compliance in `docs/DECISIONS.md`. Until then, nothing in the native build may show web prices or web checkout links.
- **Funnel analytics.** Add events `app_cta_shown`, `app_store_clicked`, `app_signed_in` (with platform), so web-to-app conversion is measurable.

---

## 7. Phases

Each phase lists **deliverables**, **acceptance criteria**, and any **🧑 HUMAN** checkpoints. Update `docs/STATUS.md` at the end of every phase.

### Phase 0 — Prerequisites and human setup

- Check local tooling: Node (current LTS), pnpm, git, GitHub CLI (`gh`), Wrangler. Report what's missing with install commands.
- Write `docs/SETUP_HUMAN.md` in **Bahasa Indonesia**, step by step:
  1. GitHub account + `gh auth login`
  2. Cloudflare account + `wrangler login` (free plan is fine to start; note when Workers Paid becomes necessary)
  3. Duitku **sandbox** account → get sandbox Merchant Code and API Key
  4. Google Cloud Console → OAuth client for "Login with Google" (redirect URIs for local and preview)
  5. OpenPanel account → project + client ID
  6. Sentry account → project DSNs (browser + worker)
  7. Email provider account (per Section 2)

🧑 **HUMAN:** complete `docs/SETUP_HUMAN.md` steps 1–2 now. Steps 3–7 can be done when their phases arrive.

**Accept:** tooling present, `gh` and `wrangler` authenticated.

### Phase 1 — Monorepo, tooling, CI, agent rules

- Scaffold the layout in Section 3 with pnpm workspaces + Turborepo, strict TypeScript, Biome.
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, and **`verify`** (= lint + typecheck + test + build; e2e when available).
- Write the real `CLAUDE.md` (see Section 8) and empty `docs/DECISIONS.md`, `docs/STATUS.md`.
- `apps/api`: minimal Hono Worker with `GET /api/health`, serving the `apps/app` web export as static assets on the same origin.
- `apps/app`: minimal Expo Router screen (web target) that calls `/api/health` through the Hono RPC client. Confirm it also starts in Expo Go or a dev build on a phone, to prove native-readiness from day one.
- GitHub Actions:
  - On PR: install → `pnpm verify` → deploy a **preview** (Wrangler preview/versions URL) → comment the URL on the PR.
  - Auto-merge: PRs opened by the agent merge automatically when all checks pass.
  - On `main`: `pnpm verify` → apply D1 migrations → deploy to production → run a smoke test (health check, sign-in page loads, billing status endpoint responds) → if the smoke test fails, roll back to the previous Worker version automatically and open an issue describing the failure.
  - **Migration safety:** migrations must be backward-compatible (expand first, contract in a later release), so a code rollback never breaks on the new schema. Take a D1 backup/bookmark before applying migrations in production.
- Optional: a Claude Code hook that runs `pnpm verify` before a session ends. Configure it per the current Claude Code hooks documentation, or document why it was skipped.

🧑 **HUMAN:** one-time only: confirm the GitHub repo exists (the agent may create it with `gh repo create`) and add the Cloudflare API token as a GitHub secret.

**Accept:** `pnpm verify` green locally and in CI. A PR produces a working preview URL that shows the health check.

### Phase 2 — Database

- `packages/db`: Drizzle schema for the core tables (Section 5), migrations via drizzle-kit, wired to D1 (local + preview + production databases).
- Seed script for local dev.
- Document how a product adds its own tables in `packages/db/src/features/`.

**Accept:** migrations apply locally and on preview. Tests cover the entitlement rules against a real local D1 (Workers Vitest pool).

### Phase 3 — Auth

- Better Auth with Google OAuth + email magic link, D1 via the Drizzle adapter, cookie sessions on the same origin. Structure the auth setup so a native client can be added later without changing the user model (see Section 6b); document the planned native session approach in `docs/DECISIONS.md`.
- Signup records `terms` and `privacy` consents (with versions). If `legal.sensitiveDataConsent` is true, add an explicit sensitive-data consent step.
- Rate-limit auth endpoints.
- Web: sign-in page, magic-link landing, sign-out, protected route wrapper.

🧑 **HUMAN:** provide Google OAuth credentials and email provider key (`SETUP_HUMAN.md` steps 4 and 7).

**Accept:** a human can sign in with Google and with a magic link on the preview URL. E2E test covers magic-link sign-in using a test inbox or dev mail capture.

### Phase 4 — Billing (Duitku sandbox)

- Implement Section 6 fully: provider interface, `DuitkuProvider`, checkout, webhook, return page, status polling, receipt email, pending-payment expiry cron.
- Trial grant per config.
- Renewal reminders cron: email at 7 days and 1 day before expiry, and on expiry, with a one-click renew link. Use `reminders_sent` to prevent duplicates.
- Paywall component in `packages/ui` plus `requireAccess()` API middleware.

🧑 **HUMAN:** provide Duitku sandbox credentials and set the callback URL in the Duitku dashboard (if the dashboard requires it). Then perform one sandbox payment via QRIS and one via an e-wallet on the preview URL, and confirm access was granted.

**Accept:** all billing tests from Section 6 pass. The human's sandbox payments create entitlements with correct expiry. Webhook replay does not double-grant.

### Phase 5 — App shell (apps/app)

- Layout, navigation, responsive and mobile-first (most users are on Android phones).
- i18n with `id` default, `en` secondary. All strings via keys.
- Theming from `product.config.ts` brand tokens via NativeWind, light and dark. Use RN primitives (`View`, `Text`, `Pressable`) through `packages/ui`; any web-only code lives in `*.web.tsx` files.
- Pages: home (placeholder for features), **Akun** (profile, subscription status with expiry date, renew button, payment history), **data export** (JSON download of the user's data) and **account deletion** (UU PDP rights), pricing/paywall, billing return.
- An example feature in `features/example/` that is gated by `requireAccess()`, to demonstrate the pattern. It must be trivially deletable.

**Accept:** Lighthouse mobile performance ≥ 80 and accessibility ≥ 90 on the app preview (the SEO-critical pages live in `apps/site`). The home and Akun screens also render in a native dev build on a phone. E2E: sign in → start trial → access gated feature → trial expiry (time-mocked) → paywall → sandbox purchase → access restored.

### Phase 6 — Launch kit (apps/site)

- Astro static site reading `product.config.ts`: landing page, pricing (plans from config), FAQ, **SEO content page template** (for pages like `/kolesterol` in future products), privacy policy, terms of service, contact.
- Privacy policy and terms are **templates** with placeholders and a visible banner in non-production builds: "TEMPLATE — perlu review hukum sebelum launch".
- Sitemap, robots.txt, Open Graph images, canonical URLs, basic structured data.
- Analytics on both site and app, with consistent event names (Section 9).

**Accept:** site builds and deploys to preview. Lighthouse SEO ≥ 95. Pricing reflects config changes without code edits.

### Phase 7 — Observability and admin

- OpenPanel on site and app. Sentry on web and worker, with PII scrubbing (no emails, names, or payment payloads in error events).
- `/admin` (allowlisted emails only): total users, active entitlements (trial vs paid), revenue by month (from `payments`), recent payments, manual entitlement grant, webhook event log.

**Accept:** a thrown test error appears in Sentry without PII. Admin numbers match the database in tests.

### Phase 8 — Factory tooling

- `docs/SPEC_TEMPLATE.md`: the one-page product spec format (Section 10).
- `factory.json`: registry of products (slug, repo, status `idea`/`building`/`live`/`killed`, launch date, kill criteria, metric targets, review date). The template repo includes an example entry.
- `scripts/new-product`: creates a new product repo from the template (GitHub template repo + `gh repo create --template`), sets `product.config.ts`, creates the D1 database and R2 bucket, writes `.dev.vars.example`, registers the product in the human's portfolio registry.
- `docs/TEMPLATE_SYNC.md`: how a product repo adds the template as a git remote and pulls core updates. Thanks to the ownership rule, merges should only touch `core/` and `packages/`.
- Agent playbooks as Claude Code skills in `.claude/skills/<name>/SKILL.md` (each becomes a `/name` command). Check the current Claude Code docs for the exact skill format:
  - `/new-product` — run `scripts/new-product` from a spec.
  - `/build-from-spec` — read a spec in `specs/`, plan the features, implement in `features/`, test, open a PR with a preview URL.
  - `/add-feature` — add one feature to an existing product following the ownership rule.
  - `/add-plan` — change plans/prices via config and verify paywall + site.
  - `/launch-check` — run the pre-launch checklist (Section 11) and report pass/fail per item.
  - `/sync-template` — pull template updates into a product repo and resolve conflicts.

**Accept:** run `/new-product` on a tiny dummy spec ("Catatan Harian": a notes app with one paid feature). It produces a new repo whose preview works end-to-end: sign in → trial → paid feature → sandbox purchase. Then delete the dummy product and repo.

### Phase 9 — Hardening and handover

- Security pass: rate limits on auth, checkout, and webhook; Zod validation on every input; secure headers; R2 access only via signed URLs; no secrets in client bundles; dependency audit.
- Second payment adapter: implement `DokuProvider` (DOKU Checkout, non-SNAP signature scheme) against the same `PaymentProvider` interface and the same test suite, switchable via `payments.provider`. Note: DOKU Checkout lets users retry with another method, so its FAILED notifications must not end the payment; read DOKU's notification best-practice docs.
- Backups: document D1 export/restore (Time Travel or scheduled export) in `docs/OPERATIONS.md`.
- Final `docs/STATUS.md` summary with what exists, known limitations, and recommended next steps.

**Accept:** `/launch-check` passes on the template itself, except for items that are legitimately product-specific.

### Phase 10 — Native apps (LATER — do not start until the human asks)

Triggered per product when the human decides it is ready for app stores. Outline only:
- EAS Build/Submit (or local Xcode) for iOS and Android from `apps/app`.
- Sign in with Apple (required on iOS when offering Google sign-in).
- In-app purchases via Adapty or RevenueCat. Store webhooks write entitlements with source `app_store`/`play_store`. The same plans map to store products.
- Push notifications (Expo Push) for renewal and habit reminders.
- Universal links / app links so magic links and "Lanjut di aplikasi" open the app.
- Compliance review per Section 6b, then 🧑 **HUMAN:** Apple Developer (organization, needs D-U-N-S) and Google Play developer accounts, store listings, and submission approval.

---

## 8. `CLAUDE.md` (write this file in Phase 1, then keep it current)

The agent must write a `CLAUDE.md` at the repo root containing at least:

- **What this repo is:** the factory template (or, in product repos, which product it is and a link to its spec).
- **Ownership rule** (Section 3) in bold, with examples of what may and may not be edited.
- **How to run:** `pnpm dev`, `pnpm verify`, how to apply migrations, how to get a preview URL.
- **Definition of done:** `pnpm verify` green, tests added for new logic, i18n keys for all strings, `docs/STATUS.md` updated, PR opened with preview URL.
- **Hard rules:** ship to production only through CI (never `wrangler deploy` to production from a laptop), no real payment keys in code or repo, no secrets in code, never bypass `requireAccess()` for paid features, never weaken webhook verification, never add browser-only APIs outside `*.web.tsx`, never show web prices or web checkout links in native builds.
- **Product guardrails** (apply to all products made by this factory):
  - Wellness, education, and information products give **general guidance, never diagnosis, prescriptions, or personalized medical, legal, or financial advice**. Health-adjacent products show a clear "bukan pengganti tenaga profesional" notice and route red-flag situations to professionals.
  - Nutrition or health numbers shown to users must come from **curated data stored in the product**, never from model memory. AI may phrase and combine; it must not invent facts or numbers.
  - Tone: friendly, plain Bahasa Indonesia; never shaming users about their bodies, food, or habits.
- **Available playbooks** (`/new-product`, `/build-from-spec`, etc.) and when to use each.
- **Where things are:** short map of the repo.

Keep `CLAUDE.md` short and factual (under ~200 lines). Put longer guides in `docs/`.

---

## 9. Standard analytics events (same names in every product)

`site_view`, `pricing_view`, `signup_started`, `signup_completed`, `trial_started`, `paywall_shown`, `checkout_started`, `payment_paid`, `payment_failed`, `renewal_reminder_sent`, `renewal_clicked`, `entitlement_expired`, `account_deleted`.

Product features add their own events, prefixed with `feature_` (e.g. `feature_mode_selected`). Never send PII in event properties.

---

## 10. `docs/SPEC_TEMPLATE.md` (one page per product)

```md
# <Product name> — Spec v<n>

## One-liner
<What it does, for whom, in one sentence.>

## Target user & problem
<Who, what pain, how they solve it today.>

## Core features (v1 — max 3)
1. …
2. …
3. …

## Paid vs free
- Free / trial: …
- Paid (6 or 12 months): …

## Plans & prices
- 6 bulan: Rp…
- 12 bulan: Rp…

## Data the product stores
<List. Flag anything sensitive (health, children, finance, location).>

## Content & data sources
<Where facts/numbers come from. Who curates them.>

## Out of scope for v1
- …

## Launch & distribution
- Launch date: …
- First channel(s): SEO pages / content / community / ads
- Success metric at day 30: …
- Kill criteria at day 60: …

## Open questions
- …
```

The agent must refuse to start `/build-from-spec` if the spec is missing **Core features**, **Paid vs free**, **Data the product stores**, or **Kill criteria**. It should ask the human to fill them in.

---

## 11. Pre-launch checklist (`/launch-check`)

- [ ] `pnpm verify` green on `main`
- [ ] E2E happy path passes on preview (sign in → trial → paid feature → purchase → access)
- [ ] Payment provider switched to **production** credentials *(🧑 HUMAN only)* and one real low-value payment tested
- [ ] Callback URL set for production in the provider dashboard
- [ ] Custom domain connected (site + app), HTTPS valid
- [ ] Privacy policy & terms reviewed, "TEMPLATE" banner removed *(🧑 HUMAN)*
- [ ] Consent records created at signup; data export and account deletion work
- [ ] Sentry receiving errors; PII scrubbing verified
- [ ] OpenPanel receiving all standard events
- [ ] Renewal reminder emails render correctly (send test)
- [ ] Lighthouse: performance ≥ 90 (mobile), accessibility ≥ 90, SEO ≥ 95
- [ ] `factory.json` entry updated: status `live`, launch date, metric targets, kill criteria, review date
- [ ] Latest production deploy passed its smoke test; rollback path verified at least once

---

## 12. All 🧑 HUMAN checkpoints at a glance

| When | What the human does |
|---|---|
| Phase 0 | GitHub + Cloudflare accounts, CLI logins |
| Phase 1 | Confirm repo, add Cloudflare API token secret (one-time) |
| Phase 3 | Google OAuth credentials, email provider key |
| Phase 4 | Duitku sandbox credentials, set callback URL, do two sandbox payments |
| Every launch | Switch payment provider to production credentials, legal review of policy pages |

Everything else is the agent's job.

---

## 13. After v1: first products (NOT part of the template)

Once Phase 9 is accepted, the factory is ready. The first products are created with `/new-product`, each in its **own repo**, never inside the template:

1. **Myna MealPlan**: food guidance with modes (kolesterol, diet, high-protein, …). Spec to be written separately with `docs/SPEC_TEMPLATE.md`.
2. A second product from a **different sector**, to prove the template is truly sector-agnostic. If building it requires editing `core/`, treat that as a template bug: fix it in the template, then sync.

Legal entity note: during experimentation, products may share one merchant account (one PT as "studio"). A product that gains traction can later move to its own PT, payment merchant account, and Cloudflare account by changing configuration and secrets only.
