// The browser-safe half of attribution (no database imports, so the site and the app bundle
// stay small): parsing, the device's touch, and handing it from the site to the app. D-033.

export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

/** What a device remembers about its first visit. */
export type Touch = Attribution & {
  anonId: string;
  /** Epoch ms of the first visit (also the fbc creation time for the fbclid, Meta CAPI). */
  firstSeenAt: number;
  landingPath?: string;
};

/** Query parameter that carries the device's anonId from the site to the app. */
export const ANON_PARAM = "aid";

const ANON_ID = /^[A-Za-z0-9_-]{16,64}$/;
// Generous but bounded: fbclid values run to a few hundred characters.
const MAX_LEN: Record<AttributionKey, number> = {
  utm_source: 100,
  utm_medium: 100,
  utm_campaign: 200,
  utm_content: 200,
  fbclid: 500,
};

export const isAnonId = (value: unknown): value is string => typeof value === "string" && ANON_ID.test(value);

export function newAnonId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** Trims, drops control characters and over-long values. Case is kept: fbclid is case sensitive. */
export function cleanValue(key: AttributionKey, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const v = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return v && v.length <= MAX_LEN[key] ? v : undefined;
}

/** The attribution parameters present in a URL (or its search string). */
export function attributionFromUrl(url: string | URL): Attribution {
  const params = typeof url === "string" ? new URL(url, "http://x").searchParams : url.searchParams;
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = cleanValue(key, params.get(key));
    if (v) out[key] = v;
  }
  return out;
}

/**
 * The device's touch after visiting `url`: the stored one wins (first touch), except that a
 * device without one adopts the anonId handed over in the URL (site → app) or makes a new one.
 */
export function resolveTouch(stored: Touch | null, url: string | URL, now = Date.now()): Touch {
  if (stored && isAnonId(stored.anonId)) return stored;
  const u = typeof url === "string" ? new URL(url, "http://x") : url;
  const handed = u.searchParams.get(ANON_PARAM);
  const firstSeen = Number(u.searchParams.get("fst"));
  return {
    anonId: isAnonId(handed) ? handed : newAnonId(),
    // The site's first-visit time comes along with its anonId, so fbc keeps the click time.
    firstSeenAt: isAnonId(handed) && Number.isInteger(firstSeen) && firstSeen > 0 && firstSeen <= now ? firstSeen : now,
    landingPath: u.pathname.slice(0, 300),
    ...attributionFromUrl(u),
  };
}

/** Adds the touch to a link into the app, so the app keeps the same anonId and attribution. */
export function withTouch(href: string, touch: Touch): string {
  const url = new URL(href);
  url.searchParams.set(ANON_PARAM, touch.anonId);
  url.searchParams.set("fst", String(touch.firstSeenAt));
  for (const key of ATTRIBUTION_KEYS) {
    const v = touch[key];
    if (v && !url.searchParams.has(key)) url.searchParams.set(key, v);
  }
  return url.toString();
}

/** Parses a stored touch defensively (localStorage can hold anything). */
export function parseTouch(raw: string | null): Touch | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Record<string, unknown>;
    if (!isAnonId(t.anonId) || typeof t.firstSeenAt !== "number") return null;
    const touch: Touch = { anonId: t.anonId, firstSeenAt: t.firstSeenAt };
    if (typeof t.landingPath === "string") touch.landingPath = t.landingPath.slice(0, 300);
    for (const key of ATTRIBUTION_KEYS) {
      const v = cleanValue(key, t[key]);
      if (v) touch[key] = v;
    }
    return touch;
  } catch {
    return null;
  }
}
