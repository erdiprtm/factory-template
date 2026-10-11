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

Also confirm: secrets are only in Wrangler/GitHub secrets (`git grep -nE "re_[A-Za-z0-9]{10}|sk_live|BEGIN PRIVATE"` finds nothing), and `Read(.dev.vars)` stays denied.

For the template repo itself, items 3, 5, 6, 9, 10 and 12 are legitimately product-specific. Mark them N/A (template).
