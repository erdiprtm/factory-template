import { describe, expect, it } from "vitest";
import { type ClarityWindow, loadClarity, setClarityConsent } from "./clarity";

// D-137: denied (cookieless) before anything is sent; "Izinkan" grants analytics only, never ads.
function fakeWindow() {
  const appended: { async: boolean; src: string }[] = [];
  const w: ClarityWindow = {
    document: {
      createElement: () => ({ async: false, src: "" }),
      head: { appendChild: (n) => appended.push(n as never) },
    },
  };
  return { w, appended };
}

describe("Clarity", () => {
  it("queues consent denied before the tag loads, then loads the project's tag once", () => {
    const { w, appended } = fakeWindow();
    expect(loadClarity("zhvz11sfu9", w)).toBe(true);
    expect(w.clarity?.q?.[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }]);
    expect(appended).toEqual([{ async: true, src: "https://www.clarity.ms/tag/zhvz11sfu9" }]);
    expect(loadClarity("zhvz11sfu9", w)).toBe(false);
    expect(appended).toHaveLength(1);
  });

  it("refuses an id that isn't a Clarity project id", () => {
    const { w, appended } = fakeWindow();
    expect(loadClarity('x"><script>', w)).toBe(false);
    expect(appended).toHaveLength(0);
  });

  it("'Izinkan' grants analytics storage only; ads stay denied", () => {
    const { w } = fakeWindow();
    loadClarity("zhvz11sfu9", w);
    setClarityConsent(true, w);
    expect(w.clarity?.q?.at(-1)).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
    setClarityConsent(false, w);
    expect(w.clarity?.q?.at(-1)).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }]);
  });
});
