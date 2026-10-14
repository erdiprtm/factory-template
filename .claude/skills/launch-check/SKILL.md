---
name: launch-check
description: Run the pre-launch checklist (FACTORY_BLUEPRINT.md Section 11) for this product and report pass/fail per item.
disable-model-invocation: true
---

# /launch-check

Check every item and report a table: item, PASS/FAIL/HUMAN, evidence (command output, URL, or file). Don't fix things silently. List the fixes as follow-ups. Human-only items are marked HUMAN and explained in Bahasa Indonesia.

| # | Item | How to check |
|---|---|---|
| 1 | `pnpm verify` green on `main` | Latest `main` commit: `gh run list --workflow deploy.yml --branch main --limit 1` is success; run `pnpm verify` locally on `main` |
| 2 | E2E happy path on the preview (sign in → trial → paid feature → purchase → access) | The latest PR's `preview` check passed, and `pnpm e2e` passed |
| 3 | Payment provider on **production** credentials, plus one real low-value payment | HUMAN. Check `DUITKU_MODE` in `apps/api/wrangler.jsonc` is `production` and `/admin` lists a real paid payment |
| 4 | Callback URL for production | Duitku sends the callback URL per transaction (`/api/webhooks/duitku`); confirm a production webhook event in `/admin` |
| 5 | Custom domain (app and site) with valid HTTPS | `product.config.ts` `domain.app` / `domain.site` are set, and `curl -sI https://<domain>` returns 200 |
| 6 | Privacy and terms reviewed, TEMPLATE banner removed | HUMAN. Set `legal.reviewed: true` after legal review; the production `/privasi/` has no banner |
| 7 | Consent recorded at signup; data export and deletion work | E2E `account.spec.ts` and API `account.test.ts` passed |
| 8 | Sentry receiving errors, PII scrubbing verified | Phase 7 setup: a test error appears in Sentry without email, name, or payment data |
| 9 | OpenPanel receiving all standard events | The OpenPanel dashboard shows the Section 9 events from preview and production |
| 10 | Renewal reminder emails render correctly | Send a test with `RESEND_API_KEY` set (cron test, or trigger `runScheduled` on preview) and review the email |
| 11 | Lighthouse: performance ≥ 90 (mobile), accessibility ≥ 90, SEO ≥ 95 | `e2e/node_modules/.bin/lighthouse <url> --form-factor=mobile` on production site and app pages |
| 12 | `factory.json` entry updated: status `live`, launch date, metric targets, kill criteria, review date | Read the template repo's `factory.json` |
| 13 | Latest production deploy passed its smoke test; rollback path verified at least once | Latest `deploy.yml` run is green; a `rollback_drill` run exists (`gh run list --workflow deploy.yml --event workflow_dispatch`) |
| 14 | Sell engine: funnel and offer configured for this product | `features/quiz.ts` is the product's quiz (not `contoh-v1`) or `null`; `funnel.*` is set from the spec; at least one lander in `apps/site/src/content/landers/` (not `contoh.md`) has a `hook` that matches the live ad word for word |
| 15 | Meta Pixel + Conversions API (only if the product runs Meta ads) | `marketing.metaPixelId` is the **product's own** Pixel, not the template test Pixel `1134506435670666`. HUMAN: `META_CAPI_TOKEN` is set on production. One sandbox purchase shows **Purchase, Received from: Server, Processed** in Events Manager → Test events (set `META_TEST_EVENT_CODE` for the test, then remove it) |
| 16 | `META_TEST_EVENT_CODE` is **not** set on production | HUMAN: `pnpm --filter @factory/api exec wrangler versions secret list --env=""` (from anywhere in the repo) does not list it. Otherwise real events stay marked as test |
| 17 | Domain verified in Meta Business settings → Brand safety → Domains | HUMAN, once the product has its own domain |
| 18 | Ad copy and landers follow CLAUDE.md "Ads and landers" | Read every lander `hook`/`sub` and the live ads: no before/after, weight-loss or medical claims, and no personal attributes. Every ad carries the UTM template `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}` |

Also confirm: secrets are only in Wrangler/GitHub secrets (`git grep -nE "re_[A-Za-z0-9]{10}|sk_live|BEGIN PRIVATE"` finds nothing), and `Read(.dev.vars)` stays denied.

For the template repo itself, items 3, 5, 6, 9, 10, 12, 14, 15, 17 and 18 are legitimately product-specific. Mark them N/A (template).
