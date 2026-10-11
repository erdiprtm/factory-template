import { describe, expect, it, vi } from "vitest";
import { createAnalytics, isValidEvent, openPanelProvider, scrubProps } from "./index";

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
