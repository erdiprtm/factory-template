import product from "../../../../../product.config";
import { track } from "../analytics";

// Paywall placement (D-037), from product.config.ts funnel.paywallPlacement:
//   after_quiz          the paywall follows the quiz summary and sign-in
//   after_first_result  the product shows its first real result, with the offer underneath
//   after_quota         only once the free uses of the core action run out (402)
export const paywallPlacement = product.funnel.paywallPlacement;

/**
 * "Pay for proof" (D-042, D-043): the product's public screen for a visitor's first use, or null
 * when the first result needs an account. The quiz leads there instead of to sign-in.
 */
export const anonymousEntry: string | null =
  product.funnel.anonymousFreeUses > 0 ? product.funnel.anonymousEntry : null;

let reported = false;

/**
 * Call when a product feature shows its first real result (the "aha"). Tracks first_result once
 * per app load and per device; UpgradePrompt decides whether to show the offer.
 */
export function reportFirstResult(): void {
  if (reported) return;
  reported = true;
  try {
    if (globalThis.localStorage?.getItem("factory.firstResult")) return;
    globalThis.localStorage?.setItem("factory.firstResult", "1");
  } catch {}
  track("first_result");
}
