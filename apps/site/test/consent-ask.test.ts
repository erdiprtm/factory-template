import { defineProduct, type ProductConfigInput } from "@factory/config";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { siteAsksConsent } from "../src/lib/site";

// D-132: which site pages show the "iklan/marketing" banner on a first visit. Holds in every product.
const base: ProductConfigInput = JSON.parse(JSON.stringify(product));
const consent = (c: Partial<{ askAt: string; siteAskPaths: string[] }>) => ({
  askAt: "after_first_result",
  siteAskPaths: [],
  ...c,
});

describe("site consent ask (D-107, D-132)", () => {
  it("never without a Pixel", () => {
    expect(
      siteAsksConsent("/ebook/x/", { metaPixelId: undefined, consent: consent({ siteAskPaths: ["/ebook/"] }) }),
    ).toBe(false);
  });

  it("every page when the product asks at first visit", () => {
    expect(siteAsksConsent("/harga/", { metaPixelId: "1234567890", consent: consent({ askAt: "first_visit" }) })).toBe(
      true,
    );
  });

  it("otherwise only under siteAskPaths", () => {
    const m = { metaPixelId: "1234567890", consent: consent({ siteAskPaths: ["/ebook/", "/l/"] }) };
    expect(siteAsksConsent("/ebook/pria-kuat/", m)).toBe(true);
    expect(siteAsksConsent("/l/promo/", m)).toBe(true);
    expect(siteAsksConsent("/", m)).toBe(false);
    expect(siteAsksConsent("/harga/", m)).toBe(false);
  });

  it("config: no paths and equal buttons by default; paths must look like site paths", () => {
    const c = defineProduct({ ...base, marketing: { metaPixelId: null } } as ProductConfigInput).marketing.consent;
    expect(c).toMatchObject({ siteAskPaths: [], allowStyle: "equal" });
    expect(() =>
      defineProduct({
        ...base,
        marketing: { metaPixelId: null, consent: { siteAskPaths: ["ebook"] } },
      } as ProductConfigInput),
    ).toThrow(/site path/);
  });
});
