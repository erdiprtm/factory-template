import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { defineProduct, type ProductConfigInput } from "./index";

const base: ProductConfigInput = JSON.parse(JSON.stringify(product));

describe("defineProduct", () => {
  // Must hold in every product repo too (D-028): no template-specific values here.
  it("accepts this repo's product.config.ts", () => {
    expect(product.slug).toMatch(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/);
    expect(product.plans.length).toBeGreaterThan(0);
  });

  it("rejects a default locale that isn't supported", () => {
    expect(() => defineProduct({ ...base, locale: { default: "en", supported: ["id"] } })).toThrow(
      /default locale must be in supported/,
    );
  });

  it("rejects duplicate plan ids", () => {
    const plan = { id: "6m", label: "6 bulan", months: 6, priceIdr: 149000 };
    expect(() => defineProduct({ ...base, plans: [plan, plan] })).toThrow(/plan ids must be unique/);
  });

  it("rejects non-integer prices", () => {
    expect(() =>
      defineProduct({ ...base, plans: [{ id: "6m", label: "6 bulan", months: 6, priceIdr: 1490.5 }] }),
    ).toThrow(/Invalid product.config.ts/);
  });

  it("anonymousHome: a site path, only on one domain (D-068)", () => {
    const one = { app: "fit.example.id", site: "fit.example.id" };
    expect(defineProduct({ ...base, domain: { ...one, anonymousHome: "/mulai/" } }).domain.anonymousHome).toBe(
      "/mulai/",
    );
    expect(defineProduct({ ...base, domain: one }).domain.anonymousHome).toBeNull();
    for (const bad of ["/", "mulai/", "/mulai", "/api/x/", "/_expo/x/", "https://x.id/mulai/"]) {
      expect(() => defineProduct({ ...base, domain: { ...one, anonymousHome: bad } }), bad).toThrow(/a site path/);
    }
    // Two domains (or none): "/" isn't shared, so there's nothing to redirect.
    expect(() =>
      defineProduct({ ...base, domain: { app: "app.example.id", site: "example.id", anonymousHome: "/mulai/" } }),
    ).toThrow(/needs one domain/);
    expect(() => defineProduct({ ...base, domain: { app: null, site: null, anonymousHome: "/mulai/" } })).toThrow(
      /needs one domain/,
    );
  });

  it("rejects slugs that can't be Worker names", () => {
    expect(() => defineProduct({ ...base, slug: "Bad_Slug" })).toThrow(/slug/);
  });

  it("needs a public entry screen when visitors get free uses before signup (D-043)", () => {
    const funnel = { ...base.funnel, freeUses: 1, anonymousFreeUses: 1 };
    expect(() => defineProduct({ ...base, funnel: { ...funnel, anonymousEntry: null } })).toThrow(/anonymousEntry/);
    expect(() => defineProduct({ ...base, funnel: { ...funnel, anonymousEntry: "scan" } })).toThrow(/anonymousEntry/);
    expect(defineProduct({ ...base, funnel: { ...funnel, anonymousEntry: "/scan" } }).funnel.anonymousEntry).toBe(
      "/scan",
    );
  });

  describe("design tokens (D-052)", () => {
    const tokens = (extra: Record<string, unknown>) => ({
      ...base,
      brand: { ...base.brand, tokens: { ...base.brand.tokens, ...extra } },
    });

    it("defaults to the template's look when nothing is set", () => {
      const t = defineProduct(tokens({ radii: undefined, shadow: undefined, density: undefined, fonts: undefined }))
        .brand.tokens;
      expect(t).toMatchObject({ radii: {}, shadow: "none", density: "regular", weights: {}, fonts: [] });
      expect(t.controlHeight).toBeUndefined();
    });

    it("accepts a full custom set", () => {
      const t = defineProduct(
        tokens({
          radii: { card: "20px", button: "9999px", chip: "8px", input: "1rem", sheet: "24px" },
          controlHeight: 56,
          shadow: "soft",
          density: "compact",
          weights: { heading: "extrabold", body: "medium" },
          fonts: [
            { family: "Fredoka", file: "Fredoka-SemiBold.ttf", weight: 600 },
            { family: "Plus Jakarta Sans", file: "PlusJakartaSans-Regular.otf" },
          ],
          fontFamily: { sans: "Plus Jakarta Sans", heading: "Fredoka" },
        }),
      ).brand.tokens;
      expect(t.fonts[1]?.weight).toBe(400);
    });

    it("accepts several weights of one family, but not the same weight twice (D-057)", () => {
      const fonts = [400, 500, 600, 700, 800].map((weight) => ({
        family: "Plus Jakarta Sans",
        file: `PlusJakartaSans-${weight}.ttf`,
        weight,
      }));
      const fontFamily = { sans: "Plus Jakarta Sans" };
      expect(defineProduct(tokens({ fonts, fontFamily })).brand.tokens.fonts).toHaveLength(5);
      expect(() => defineProduct(tokens({ fonts: [...fonts, fonts[0]], fontFamily }))).toThrow(/listed twice/);
    });

    it("rejects invalid values", () => {
      for (const bad of [
        { radii: { card: "big" } },
        { radii: { button: "12" } },
        { controlHeight: 40 },
        { controlHeight: 48.5 },
        { shadow: "huge" },
        { density: "airy" },
        { weights: { heading: "thin" } },
        { fonts: [{ family: "Inter", file: "../evil.ttf" }] },
        { fonts: [{ family: "Inter", file: "Inter.exe" }] },
        // Metro and expo-font on native can't load woff/woff2.
        { fonts: [{ family: "Inter", file: "Inter.woff2" }], fontFamily: { sans: "Inter" } },
        { fonts: [{ family: "Inter", file: "Inter.ttf", weight: 450 }] },
        // Once fonts are bundled, fontFamily must name them.
        { fonts: [{ family: "Inter", file: "Inter.ttf" }], fontFamily: { sans: "Roboto" } },
      ]) {
        expect(() => defineProduct(tokens(bad)), JSON.stringify(bad)).toThrow(/Invalid product.config.ts/);
      }
    });
  });
});
