---
name: funnel-diagnose
description: Read the funnel and unit-economics numbers from /admin, find the FIRST step that is below its benchmark, and recommend fixing only that layer (creative, lander scent, onboarding, offer, or tracking).
argument-hint: <paste the /admin numbers or a screenshot> [campaign]
disable-model-invocation: true
---

# /funnel-diagnose

Numbers: $ARGUMENTS

Get the numbers from `/admin` → "Unit economics iklan" (funnel, per campaign, CAC/ROAS). The human pastes them or shares a screenshot; never invent numbers. Ads Manager numbers (impressions, CTR, CPM) come from the human too.

## Method

1. **Is tracking alive?** Compare Meta link clicks with `lp_view`, and payments in `/admin` with `purchase`. A big gap (lp_view under ~60% of link clicks, or a paid payment with no purchase event) means **fix tracking first** and stop. Check: consent banner, the UTM tags in the ad URL, the Pixel ID and CAPI token, Events Manager test events.
2. **Walk the funnel top-down** and stop at the **first** step below its benchmark. `/admin` already marks it red. Later steps are noise until it's fixed, because their sample is too small and their visitors are the wrong ones.
3. **Sample size:** say so when the step has fewer than ~100 visitors, and give the read date instead of a verdict.

## Which layer, by first bad step

| First bad step | Layer | Typical fixes |
|---|---|---|
| CTR in Ads Manager (before `lp_view`) | **Creative** | new hook (`/ad-hooks`), new S1 opening (`/creative-brief`), different person or setting |
| `lp_view → cta_tap` | **Lander scent** | does the headline repeat the ad's hook word for word? Is the CTA above the fold? Is the page slow (LCP > 2.5 s on 4G)? |
| `cta_tap → quiz_start`, `quiz_start → quiz_complete` | **Onboarding** | fewer steps, easier first question, drop the step where people quit (look at `quiz_step`) |
| `quiz_complete → first_result`, `first_result → paywall_view` | **Onboarding / aha** | get to the real result faster, make the result more specific to their answers |
| `paywall_view → checkout_start`, `checkout_start → purchase` | **Offer** | price framing, the 12-month saving, trial, free uses, visible QRIS/e-wallet; check payment errors in `/admin` webhooks |
| Purchases fine, ROAS D7 < 1.75 or LTV − CAC < 0 | **Offer / economics** | price, plan mix, renewal reminders; or the CAC target is unrealistic |

## Output

1. One sentence: "Langkah pertama yang bermasalah: X (Y% vs patokan Z%)".
2. The layer, and why the others wait.
3. Up to 3 concrete changes for that layer only, each with how the next read will show if it worked.
4. What not to change now.
