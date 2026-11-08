import type { ProductConfig } from "@factory/config";

// One domain (D-068): "/" belongs to the app Worker, so a stranger who types the domain would get
// the sign-in screen. With domain.anonymousHome set, a page load of "/" without a session cookie
// goes to the landing page the site Worker serves there instead.

/**
 * Link-preview crawlers and search bots (D-127). They ask for "/" with a wildcard Accept (WhatsApp,
 * Facebook, Instagram) or no text/html at all, so the Accept check alone handed them the app shell,
 * which has no og: tags: blank previews of the bare domain. Matched case-insensitively anywhere in
 * the User-Agent. iMessage previews use the facebookexternalhit/Twitterbot UAs; Instagram and
 * Threads use facebookexternalhit or meta-externalagent.
 */
const LINK_PREVIEW_BOT =
  /facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|googlebot|google-inspectiontool|bingbot|applebot|pinterest|redditbot|skypeuripreview|vkshare|embedly|iframely|mastodon|bluesky|yandexbot|duckduckbot/i;

/** A browser's page load (asks for HTML) or a known link-preview / search crawler. */
function wantsPage(req: Request): boolean {
  if ((req.headers.get("accept") ?? "").includes("text/html")) return true;
  return LINK_PREVIEW_BOT.test(req.headers.get("user-agent") ?? "");
}

/** Better Auth's session cookie, with or without the __Secure- prefix it uses on https. */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

/**
 * The 302 to anonymousHome for a browser's page load (or a link-preview crawler's fetch, D-127) of
 * "/" on the production domain without a session cookie (presence only: no DB call; an expired cookie still gets the app, which shows
 * sign-in). null = serve the app as usual: other paths and hosts (workers.dev, previews, local),
 * other non-HTML requests (fetch, uptime checks, a service worker's precache), and every request
 * with a session cookie.
 */
export function anonymousHomeRedirect(req: Request, domain: ProductConfig["domain"]): Response | null {
  if (!domain.anonymousHome || !domain.app) return null;
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const url = new URL(req.url);
  if (url.hostname !== domain.app || url.pathname !== "/") return null;
  if (!wantsPage(req)) return null;
  if (SESSION_COOKIE.test(req.headers.get("cookie") ?? "")) return null;
  return new Response(null, {
    // 302, never 301: the answer depends on the cookie, and browsers cache 301s.
    status: 302,
    headers: {
      // The query string survives, so ad attribution (utm_*, fbclid) reaches the landing.
      location: `${domain.anonymousHome}${url.search}`,
      "cache-control": "no-store",
      // The answer depends on all three; no-store already keeps it out of every cache.
      vary: "Cookie, Accept, User-Agent",
    },
  });
}
