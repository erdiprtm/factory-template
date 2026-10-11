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

/** The part of an OpenPanel client (`@openpanel/web` `OpenPanel`) this adapter uses. */
export type OpenPanelLike = { track(name: string, properties?: Record<string, unknown>): unknown };

/** AnalyticsProvider over OpenPanel. Wrap it with createAnalytics so names are checked and PII scrubbed. */
export function openPanelProvider(op: OpenPanelLike): AnalyticsProvider {
  return {
    track(event, props) {
      void op.track(event, props);
    },
  };
}

/**
 * Server-side events (webhook, cron) to OpenPanel's HTTP API: things the browser can't see
 * reliably, like a payment confirmed after the user closed the tab. Same name check and PII
 * scrubbing as the browser; the user is identified by the opaque profileId only. Never throws:
 * analytics must not break a webhook or the cron.
 */
export function openPanelServer(opts: {
  clientId: string;
  clientSecret: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const send = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return {
    async track(event: AnalyticsEvent, props?: EventProps, profileId?: string): Promise<void> {
      if (!isValidEvent(event)) return;
      try {
        await send(`${opts.apiUrl ?? "https://api.openpanel.dev"}/track`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "openpanel-client-id": opts.clientId,
            "openpanel-client-secret": opts.clientSecret,
          },
          body: JSON.stringify({ type: "track", payload: { name: event, profileId, properties: scrubProps(props) } }),
        });
      } catch {
        // Dropped on purpose: analytics is best effort.
      }
    },
  };
}

export type ServerAnalytics = ReturnType<typeof openPanelServer>;

/** Used when no OpenPanel secret is configured (local dev, tests, previews). */
export const noopServerAnalytics: ServerAnalytics = { track: async () => {} };
