/** The paywall's body text: it mentions the free trial only when the product offers one. */
export const paywallBodyKey = (trialEnabled: boolean): "paywall.body" | "paywall.bodyNoTrial" =>
  trialEnabled ? "paywall.body" : "paywall.bodyNoTrial";
