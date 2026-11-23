// Microsoft Clarity on the site (D-137): product analytics (clicks, scroll depth, heatmaps), never
// an ad tag. The site loads it only after "Izinkan": tested 2026-11-23, loading the tag with consent
// denied still set Microsoft cookies (CLID from the tag request, MUID via a c.bing.com sync), although
// the Consent API v2 docs say denied means no cookies. Once loaded, consentv2 keeps ad_Storage denied
// (nothing to Microsoft Ads) and grants analytics_Storage only; the queue starts denied, as a guard.

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
export type ClarityWindow = {
  clarity?: ClarityFn;
  document: {
    createElement(tag: "script"): { async: boolean; src: string };
    head: { appendChild(n: unknown): unknown };
  };
};

const PROJECT_ID = /^[a-z0-9]{6,20}$/;

/** The script hosts the CSP must allow when Clarity is on (the tag, then its versioned script). */
export const CLARITY_SCRIPT_HOSTS = ["https://www.clarity.ms", "https://scripts.clarity.ms"] as const;

const consent = (analytics: boolean) => ({
  ad_Storage: "denied",
  analytics_Storage: analytics ? "granted" : "denied",
});

/**
 * Loads Clarity: a queue stub (the same shape as Clarity's own snippet), consent denied queued first,
 * then the tag. Idempotent. Does nothing for an id that isn't a Clarity project id.
 */
export function loadClarity(projectId: string, w: ClarityWindow): boolean {
  if (!PROJECT_ID.test(projectId) || w.clarity) return false;
  const clarity: ClarityFn = (...args: unknown[]) => {
    clarity.q = clarity.q ?? [];
    clarity.q.push(args);
  };
  w.clarity = clarity;
  clarity("consentv2", consent(false));
  const script = w.document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  w.document.head.appendChild(script);
  return true;
}

/** The visitor's choice on the consent banner: "Izinkan" grants analytics cookies, never ads. */
export function setClarityConsent(granted: boolean, w: Pick<ClarityWindow, "clarity">): void {
  w.clarity?.("consentv2", consent(granted));
}
