---
name: add-plan
description: Change subscription plans or prices via product.config.ts and verify the paywall, checkout and marketing site still match.
argument-hint: <e.g. "6 bulan Rp59000, 12 bulan Rp99000">
disable-model-invocation: true
---

# /add-plan

Requested change: $ARGUMENTS

1. Edit only `plans` in `product.config.ts`.
   - Exactly two durations (6 and 12 months).
   - Integer IDR, at least Rp10.000 (Duitku's minimum).
   - At most one `highlight`.
   - Keep existing plan **ids** unchanged so old payments still resolve. Use new ids only for genuinely new plans.
2. Update the spec's "Plans & prices" section to match.
3. `pnpm verify`. The site build test checks that `/harga/` shows every plan from config, and E2E covers checkout.
4. Open a PR with auto-merge. On the preview, check that the app pricing screen and `/harga/` on the site show the new prices.
5. Prices already paid are unaffected: entitlements store `plan_id` and months at purchase time.
