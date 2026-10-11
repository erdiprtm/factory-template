import { describe, expect, it, vi } from "vitest";
import { createAnalytics, isValidEvent, openPanelProvider, openPanelServer, scrubProps } from "./index";

describe("analytics", () => {
  it("accepts standard and feature_ events only", () => {
    expect(isValidEvent("pricing_view")).toBe(true);
    expect(isValidEvent("feature_mode_selected")).toBe(true);
    expect(isValidEvent("PricingView")).toBe(false);
    expect(isValidEvent("feature_")).toBe(false);
  });

  it("scrubs PII keys and values", () => {
    expect(
      scrubProps({ plan: "12m", email: "a@b.co", name: "Budi", note: "call 081234567890", who: "x@y.id", ok: true }),
    ).toEqual({ plan: "12m", ok: true });
  });

  it("drops unknown events and scrubs before sending", () => {
    const track = vi.fn();
    const a = createAnalytics({ track });
    a.track("checkout_started", { plan: "6m", email: "budi@example.com" });
    a.track("not_an_event" as never);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("checkout_started", { plan: "6m" });
  });
});

describe("openPanelProvider", () => {
  it("forwards valid events with scrubbed properties, drops unknown ones", () => {
    const sent: [string, unknown][] = [];
    const analytics = createAnalytics(openPanelProvider({ track: (n, p) => sent.push([n, p]) }));
    analytics.track("checkout_started", { plan: "6m", email: "budi@example.com" });
    analytics.track("not_a_standard_event" as never);
    expect(sent).toEqual([["checkout_started", { plan: "6m" }]]);
  });
});

describe("openPanelServer", () => {
  it("posts a scrubbed track event with the secret and an opaque profile id", async () => {
    const calls: [string, RequestInit][] = [];
    const op = openPanelServer({
      clientId: "cid",
      clientSecret: "sec",
      fetchImpl: async (url, init) => {
        calls.push([String(url), init as RequestInit]);
        return new Response(null, { status: 202 });
      },
    });
    await op.track("payment_paid", { plan: "6m", email: "budi@example.com" }, "user_1");
    await op.track("not_standard" as never);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openpanel.dev/track");
    expect(init.headers).toMatchObject({ "openpanel-client-id": "cid", "openpanel-client-secret": "sec" });
    expect(JSON.parse(init.body as string)).toEqual({
      type: "track",
      payload: { name: "payment_paid", profileId: "user_1", properties: { plan: "6m" } },
    });
  });

  it("never throws when OpenPanel is down", async () => {
    const op = openPanelServer({
      clientId: "cid",
      clientSecret: "sec",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await expect(op.track("payment_paid")).resolves.toBeUndefined();
  });
});
