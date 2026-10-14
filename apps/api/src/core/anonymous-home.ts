import type { ProductConfig } from "@factory/config";

// One domain (D-068): "/" belongs to the app Worker, so a stranger who types the domain would get
// the sign-in screen. With domain.anonymousHome set, a page load of "/" without a session cookie
// goes to the landing page the site Worker serves there instead.

/** Better Auth's session cookie, with or without the __Secure- prefix it uses on https. */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

/**
 * The 302 to anonymousHome for a browser's page load of "/" on the production domain without a
 * session cookie (presence only: no DB call; an expired cookie still gets the app, which shows
 * sign-in). null = serve the app as usual: other paths and hosts (workers.dev, previews, local),
 * non-HTML requests, and every request with a session cookie.
 */
export function anonymousHomeRedirect(req: Request, domain: ProductConfig["domain"]): Response | null {
  if (!domain.anonymousHome || !domain.app) return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const url = new URL(req.url);
  if (url.hostname !== domain.app || url.pathname !== "/") return null;
  if (!(req.headers.get("accept") ?? "").includes("text/html")) return null;
  if (SESSION_COOKIE.test(req.headers.get("cookie") ?? "")) return null;
  return new Response(null, {
    // 302, never 301: the answer depends on the cookie, and browsers cache 301s.
    status: 302,
    headers: {
      // The query string survives, so ad attribution (utm_*, fbclid) reaches the landing.
      location: `${domain.anonymousHome}${url.search}`,
      "cache-control": "no-store",
      vary: "Cookie",
    },
  });
}
