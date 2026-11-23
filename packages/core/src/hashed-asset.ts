// Cache rules for content-hashed build files (/_astro/* on the site, /_expo/static/* in the app):
// a year and immutable only for a real file (200, not HTML); anything else no-store (D-138).
//
// Why: a deploy is a new Worker version, and during its rollout HTML from the new version can ask
// an edge location still on the old one for a file it doesn't have (Cloudflare's "version skew").
// That answer was a 404 (site) or the SPA's index.html with 200 (app), and both inherited the
// path's `immutable` header from _headers, so a visitor kept a broken page for a year.

export const IMMUTABLE = "public, max-age=31536000, immutable";

/** The response for a hashed-asset path, from what the assets layer returned. */
export function hashedAssetResponse(res: Response): Response {
  const html = (res.headers.get("content-type") ?? "").includes("text/html");
  const headers = new Headers(res.headers);
  headers.set("x-content-type-options", "nosniff");
  if (res.status === 200 && !html) {
    headers.set("cache-control", IMMUTABLE);
    return new Response(res.body, { status: 200, headers });
  }
  headers.set("cache-control", "no-store");
  // The SPA fallback (index.html with 200) for a missing file is a miss: say so, with no body.
  if (res.status === 200) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(res.body, { status: res.status, headers });
}
