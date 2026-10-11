// Standard analytics events, identical names in every product (FACTORY_BLUEPRINT.md Section 9).
// Product features add their own, prefixed with `feature_`. Never send PII in properties.

export const STANDARD_EVENTS = [
  "site_view",
  "pricing_view",
  "signup_started",
  "signup_completed",
  "trial_started",
  "paywall_shown",
  "checkout_started",
  "payment_paid",
  "payment_failed",
  "renewal_reminder_sent",
  "renewal_clicked",
  "entitlement_expired",
  "account_deleted",
  // Web-to-app funnel (Section 6b)
  "app_cta_shown",
  "app_store_clicked",
  "app_signed_in",
] as const;

export type StandardEvent = (typeof STANDARD_EVENTS)[number];
export type FeatureEvent = `feature_${string}`;
export type AnalyticsEvent = StandardEvent | FeatureEvent;
export type EventProps = Record<string, string | number | boolean | null>;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, props?: EventProps): void | Promise<void>;
}

const PII_KEYS = /^(e-?mail|name|full_?name|first_?name|last_?name|phone|address|nik|ktp|npwp|token|password|ip)$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(\+62|\b0)8\d{7,11}\b/;

export function isValidEvent(event: string): event is AnalyticsEvent {
  return (STANDARD_EVENTS as readonly string[]).includes(event) || /^feature_[a-z0-9_]+$/.test(event);
}

/** Drops properties that look like personal data, so a careless call can't leak PII. */
export function scrubProps(props: EventProps = {}): EventProps {
  const clean: EventProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEYS.test(k)) continue;
    if (typeof v === "string" && (EMAIL.test(v) || PHONE.test(v))) continue;
    clean[k] = v;
  }
  return clean;
}

/** Wraps a provider with validation + PII scrubbing. Unknown event names are dropped (and warned in dev). */
export function createAnalytics(provider: AnalyticsProvider, opts: { dev?: boolean } = {}) {
  return {
    track(event: AnalyticsEvent, props?: EventProps) {
      if (!isValidEvent(event)) {
        if (opts.dev) console.warn(`[analytics] unknown event "${event}" (use a standard name or feature_*)`);
        return;
      }
      return provider.track(event, scrubProps(props));
    },
  };
}

/** Used when no analytics is configured (local dev, tests, products before Phase 7 setup). */
export const noopAnalytics: AnalyticsProvider = { track() {} };
