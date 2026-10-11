---
name: ad-test-plan
description: Plan Meta ad tests at Rp100K/day, one ad per test, read at 3,000 impressions, with kill and promote rules from the product's target CAC and a target ROAS of 1.75.
argument-hint: <hooks or ad names to test> [target CAC in IDR]
disable-model-invocation: true
---

# /ad-test-plan

Ads to test: $ARGUMENTS

## Inputs (look them up, don't guess)

- **Target CAC:** from `/admin` → "Kalkulator target CAC" (breakeven CAC = price × (1 − payment fee) / (1 + 11% ad tax), target slightly under). If it isn't given, compute it from `product.config.ts` (the highlighted plan's price, `economics.paymentFeePercent`, `adTaxPercent`, `targetCacFactor`) and show the math.
- **Target ROAS:** 1.75 (revenue ÷ spend, measured as ROAS D7 in `/admin`).
- The lander for each ad exists in `apps/site/src/content/landers/` with its `hook` repeated **word for word**.

## The rules

- **Budget:** Rp100.000/day per test, one ad set per test, **one ad per test**, so a result belongs to one creative.
- **Tracking first:** before any spend, run one sandbox purchase and confirm the Purchase event shows in Events Manager (and in `/admin`). If tracking is broken, nothing below can be read.
- **First read at 3,000 impressions**, not before. Don't touch an ad before then (no edits, no budget changes: they reset learning).
- **Kill** an ad when its spend reaches **2× target CAC with zero sales**.
- **Kill or rework** at 3,000 impressions if CTR (link) is under ~0.8%: that is the hook or creative, not the funnel. Use `/funnel-diagnose` to be sure.
- **Promote** only after **enough sales over several days**: at least 3 purchases across at least 3 different days, CAC ≤ target, and ROAS D7 ≥ 1.75. Then raise the budget by at most 20–30% per day, or duplicate the ad into a scaling ad set.
- **Spend tracking:** import the daily Ads Manager CSV into `/admin` (Breakdown → By time → Day). Campaign names must equal `utm_campaign`.

## Output

A table with one row per test: hook, lander URL with UTM tags, daily budget, start date, read date (estimated for 3,000 impressions at the account's CPM), kill threshold in Rp (2× target CAC), promote condition. Then a day-by-day checklist for the first 7 days, and the total spend at risk.
