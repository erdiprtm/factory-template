import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { anonymousHomeRedirect } from "../src/core/anonymous-home";
import { app } from "../src/index";

// D-068: on one domain, a page load of "/" without a session goes to the site's landing page.
const domain = { app: "fit.example.id", site: "fit.example.id", anonymousHome: "/mulai/" };
const HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const visit = (url: string, headers: Record<string, string> = {}, method = "GET") =>
  anonymousHomeRedirect(new Request(url, { method, headers: { accept: HTML, ...headers } }), domain);

describe("anonymous home (one domain, D-068)", () => {
  it("sends a page load of / without a session cookie to the landing, keeping the query string", () => {
    const res = visit("https://fit.example.id/?utm_source=ig&fbclid=abc");
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/mulai/?utm_source=ig&fbclid=abc");
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(res?.headers.get("vary")).toBe("Cookie, Accept, User-Agent");
    expect(visit("https://fit.example.id/")?.headers.get("location")).toBe("/mulai/");
    // The installed app's start_url (D-080): signed out, it lands on the landing with source=pwa kept.
    expect(visit("https://fit.example.id/?source=pwa")?.headers.get("location")).toBe("/mulai/?source=pwa");
    expect(visit("https://fit.example.id/?source=pwa", { cookie: "better-auth.session_token=x" })).toBeNull();
    // Other cookies (consent, analytics) don't count as a session.
    expect(visit("https://fit.example.id/", { cookie: "theme=dark; op_id=1" })?.status).toBe(302);
    expect(visit("https://fit.example.id/", {}, "HEAD")?.status).toBe(302);
  });

  it("sends link-preview crawlers to the landing too, whatever they accept (D-127)", () => {
    const facebook = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
    const bots = [
      facebook,
      "WhatsApp/2.23.20.0 A",
      "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ];
    for (const ua of bots) {
      for (const accept of ["*/*", "text/html,*/*"]) {
        const res = visit("https://fit.example.id/?utm_source=wa", { "user-agent": ua, accept }, "GET");
        expect(res?.status, `${ua} ${accept}`).toBe(302);
        expect(res?.headers.get("location")).toBe("/mulai/?utm_source=wa");
      }
    }
    // No Accept header at all, and HEAD (some crawlers check first).
    const bare = new Request("https://fit.example.id/", { method: "HEAD", headers: { "user-agent": facebook } });
    expect(anonymousHomeRedirect(bare, domain)?.status).toBe(302);
    // With a session cookie (crawlers never have one) it is the app, as for anyone.
    expect(
      visit("https://fit.example.id/", { "user-agent": facebook, cookie: "better-auth.session_token=x" }),
    ).toBeNull();
    // Only "/": bots on app routes and the API are untouched.
    expect(visit("https://fit.example.id/quiz", { "user-agent": facebook, accept: "*/*" })).toBeNull();
    expect(visit("https://fit.example.id/api/health", { "user-agent": facebook, accept: "*/*" })).toBeNull();
  });

  it("serves the app with a session cookie (even an expired one: the app then shows sign-in)", () => {
    expect(visit("https://fit.example.id/", { cookie: "__Secure-better-auth.session_token=x.y" })).toBeNull();
    expect(visit("https://fit.example.id/", { cookie: "a=1; better-auth.session_token=x" })).toBeNull();
  });

  it("changes nothing else: other paths, non-HTML requests, other hosts, products without it", () => {
    for (const path of ["/sign-in", "/quiz", "/api/health", "/mulai/", "/index.html"]) {
      expect(visit(`https://fit.example.id${path}`), path).toBeNull();
    }
    expect(visit("https://fit.example.id/", { accept: "application/json" })).toBeNull();
    // Plain */* from a non-bot (fetch, uptime checks, a service worker's precache) still gets the app.
    expect(visit("https://fit.example.id/", { accept: "*/*" })).toBeNull();
    expect(visit("https://fit.example.id/", { accept: "*/*", "user-agent": "curl/8.7.1" })).toBeNull();
    expect(visit("https://fit.example.id/", { accept: "*/*", "user-agent": "Mozilla/5.0 (iPhone)" })).toBeNull();
    expect(visit("https://fit.example.id/", {}, "POST")).toBeNull();
    // workers.dev, previews and local dev keep hitting the app (smoke tests, E2E).
    for (const host of ["myna-fit.acme.workers.dev", "pr-3-myna-fit-preview.acme.workers.dev", "localhost"]) {
      expect(visit(`https://${host}/`), host).toBeNull();
    }
    const off = { ...domain, anonymousHome: null };
    expect(
      anonymousHomeRedirect(new Request("https://fit.example.id/", { headers: { accept: HTML } }), off),
    ).toBeNull();
  });

  it("the Worker's / serves the app's index.html in this product (no anonymousHome)", async () => {
    const ASSETS = { fetch: async (req: Request) => new Response(`app ${new URL(req.url).pathname}`) };
    const res = await app.request("https://fit.example.id/", { headers: { accept: HTML } }, { ...env, ASSETS });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("app /");
  });
});
