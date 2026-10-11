import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sentryOptions } from "../src/core/monitoring";
import { app } from "../src/index";

const DSN = "https://0123456789abcdef@o1.ingest.us.sentry.io/1";

describe("Sentry options", () => {
  it("are off without a DSN", () => {
    expect(sentryOptions({ APP_ENV: "production" }, null)).toBeUndefined();
  });

  it("are off in local dev and tests", () => {
    expect(sentryOptions({ APP_ENV: "development" }, DSN)).toBeUndefined();
    expect(sentryOptions({ APP_ENV: "test" }, DSN)).toBeUndefined();
  });

  it("report from deployed environments with every personal-data collector off and no tracing", () => {
    const opts = sentryOptions({ APP_ENV: "production", COMMIT_SHA: "abc123" }, DSN);
    expect(opts).toMatchObject({
      environment: "production",
      release: "abc123",
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    });
    expect(opts?.dsn).toMatch(/^https:\/\/[0-9a-f]+@[^/]+\.sentry\.io\/\d+$/);
    expect(opts).not.toHaveProperty("tracesSampleRate");
    expect(sentryOptions({ APP_ENV: "preview" }, DSN)?.environment).toBe("preview");
  });

  it("beforeSend scrubs the event", () => {
    const opts = sentryOptions({ APP_ENV: "production" }, DSN);
    const event = opts?.beforeSend?.(
      { type: undefined, user: { id: "u1", email: "a@b.co" }, request: { url: "https://x.dev/a?token=t" } },
      {},
    ) as { user: unknown; request: unknown };
    expect(event.user).toEqual({ id: "u1" });
    expect(event.request).toEqual({ url: "https://x.dev/a" });
  });
});

describe("unhandled route errors", () => {
  it("answer a generic JSON 500 without internals", async () => {
    app.get("/api/__test_throw", () => {
      throw new Error("db password=hunter2 exploded");
    });
    const res = await app.request("http://localhost/api/__test_throw", {}, env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
  });
});

describe("server analytics", () => {
  it("is a no-op without a secret or outside production", async () => {
    const { serverAnalytics } = await import("../src/core/analytics");
    const { noopServerAnalytics } = await import("@factory/core/analytics");
    expect(serverAnalytics({ APP_ENV: "production" })).toBe(noopServerAnalytics);
    expect(serverAnalytics({ APP_ENV: "preview", OPENPANEL_CLIENT_SECRET: "s" })).toBe(noopServerAnalytics);
    expect(serverAnalytics({ APP_ENV: "production", OPENPANEL_CLIENT_SECRET: "s" })).not.toBe(noopServerAnalytics);
  });
});
