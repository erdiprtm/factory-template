import product from "../../../../../product.config";
import { track } from "../analytics";
import { kvGet, kvSet } from "../kv";
import { notifyMarketingChange } from "../marketing";

// Paywall placement (D-037), from product.config.ts funnel.paywallPlacement:
//   after_quiz          the paywall follows the quiz summary and sign-in
//   after_first_result  the product shows its first real result, with the offer underneath
//   after_quota         only once the free uses of the core action run out (402)
export const paywallPlacement = product.funnel.paywallPlacement;

/**
 * "Pay for proof" (D-042, D-043): the product's public screen after the quiz, or null when the next
 * step is sign-in. The quiz leads there instead of to sign-in. It may spend a free use (a scan), or
 * spend none at all (a story or demo screen, anonymousFreeUses 0, D-125).
 */
export const anonymousEntry: string | null = product.funnel.anonymousEntry;

let reported = false;
const FIRST_RESULT = "factory.firstResult";

/** Whether this device has seen the product's first real result (the marketing ask can wait for it, D-107). */
export const firstResultSeen = () => kvGet(FIRST_RESULT) !== null;

/**
 * Call when a product feature shows its first real result (the "aha"). Tracks first_result once
 * per app load and per device; UpgradePrompt decides whether to show the offer.
 */
export function reportFirstResult(): void {
  if (reported) return;
  reported = true;
  if (firstResultSeen()) return;
  kvSet(FIRST_RESULT, "1");
  track("first_result");
  // marketing.consent.askAt "after_first_result": the ask comes right after this (D-107).
  notifyMarketingChange();
}
