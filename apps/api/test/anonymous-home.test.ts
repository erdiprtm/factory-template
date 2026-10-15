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
    expect(res?.headers.get("vary")).toBe("Cookie");
    expect(visit("https://fit.example.id/")?.headers.get("location")).toBe("/mulai/");
    // The installed app's start_url (D-080): signed out, it lands on the landing with source=pwa kept.
    expect(visit("https://fit.example.id/?source=pwa")?.headers.get("location")).toBe("/mulai/?source=pwa");
    expect(visit("https://fit.example.id/?source=pwa", { cookie: "better-auth.session_token=x" })).toBeNull();
    // Other cookies (consent, analytics) don't count as a session.
    expect(visit("https://fit.example.id/", { cookie: "theme=dark; op_id=1" })?.status).toBe(302);
    expect(visit("https://fit.example.id/", {}, "HEAD")?.status).toBe(302);
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
    expect(visit("https://fit.example.id/", { accept: "*/*" })).toBeNull();
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
