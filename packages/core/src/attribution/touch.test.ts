import { describe, expect, it } from "vitest";
import { attributionFromUrl, cleanValue, isAnonId, parseTouch, resolveTouch, withTouch } from "./touch";

const ANON = "a".repeat(32);

describe("attributionFromUrl", () => {
  it("keeps the known keys, trims, and keeps fbclid's case", () => {
    expect(
      attributionFromUrl(
        "https://x.id/l/promo?utm_source=meta&utm_campaign=%20Diet%20Q4%20&fbclid=IwAR2F4-dbP0&utm_term=no&gclid=no",
      ),
    ).toEqual({ utm_source: "meta", utm_campaign: "Diet Q4", fbclid: "IwAR2F4-dbP0" });
  });

  it("drops empty, control-only and over-long values", () => {
    expect(cleanValue("utm_source", "   ")).toBeUndefined();
    expect(cleanValue("utm_source", "\u0000\u0007")).toBeUndefined();
    expect(cleanValue("utm_source", "x".repeat(101))).toBeUndefined();
    expect(cleanValue("fbclid", "x".repeat(500))).toHaveLength(500);
  });
});

describe("resolveTouch", () => {
  it("captures a first visit", () => {
    const t = resolveTouch(null, "https://app.x.id/quiz?utm_campaign=c1", 1000);
    expect(isAnonId(t.anonId)).toBe(true);
    expect(t).toMatchObject({ firstSeenAt: 1000, landingPath: "/quiz", utm_campaign: "c1" });
  });

  it("keeps the stored first touch on later visits", () => {
    const first = { anonId: ANON, firstSeenAt: 5, utm_campaign: "first" };
    expect(resolveTouch(first, `https://app.x.id/?utm_campaign=second&aid=${"b".repeat(32)}`, 9)).toBe(first);
  });

  it("adopts the anonId and first-visit time handed over by the site", () => {
    const t = resolveTouch(null, `https://app.x.id/quiz?aid=${ANON}&fst=500&utm_campaign=c1`, 1000);
    expect(t).toMatchObject({ anonId: ANON, firstSeenAt: 500, utm_campaign: "c1" });
  });

  it("ignores a malformed anonId and a first-visit time in the future", () => {
    const t = resolveTouch(null, `https://app.x.id/?aid=short&fst=99999`, 1000);
    expect(t.anonId).not.toBe("short");
    expect(t.firstSeenAt).toBe(1000);
  });
});

describe("withTouch", () => {
  it("adds the anonId, time and attribution without overriding the link's own tags", () => {
    const href = withTouch("https://app.x.id/quiz?utm_content=cta", {
      anonId: ANON,
      firstSeenAt: 7,
      utm_campaign: "c1",
      utm_content: "ad2",
    });
    const url = new URL(href);
    expect(url.searchParams.get("aid")).toBe(ANON);
    expect(url.searchParams.get("fst")).toBe("7");
    expect(url.searchParams.get("utm_campaign")).toBe("c1");
    expect(url.searchParams.get("utm_content")).toBe("cta");
  });

  it("round-trips through resolveTouch on the app", () => {
    const touch = { anonId: ANON, firstSeenAt: 7, utm_source: "meta", fbclid: "AbC" };
    expect(resolveTouch(null, withTouch("https://app.x.id/", touch), 100)).toMatchObject(touch);
  });
});

describe("parseTouch", () => {
  it("rejects junk and keeps only clean fields", () => {
    expect(parseTouch(null)).toBeNull();
    expect(parseTouch("{not json")).toBeNull();
    expect(parseTouch(JSON.stringify({ anonId: "x", firstSeenAt: 1 }))).toBeNull();
    expect(parseTouch(JSON.stringify({ anonId: ANON, firstSeenAt: 1, utm_source: 5, evil: "x" }))).toEqual({
      anonId: ANON,
      firstSeenAt: 1,
    });
  });
});
