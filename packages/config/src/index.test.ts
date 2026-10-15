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

  it("consent style and placement: today's behaviour by default, the single inline row on request (D-074)", () => {
    const parsed = defineProduct(base);
    if (!("consentStyle" in (base.legal as object))) expect(parsed.legal.consentStyle).toBe("separate");
    if (!("consentPlacement" in (base.legal as object))) expect(parsed.legal.consentPlacement).toBe("screen");
    const legal = { ...base.legal, consentStyle: "single" as const, consentPlacement: "quiz_last" as const };
    expect(defineProduct({ ...base, legal }).legal).toMatchObject({
      consentStyle: "single",
      consentPlacement: "quiz_last",
    });
    expect(() => defineProduct({ ...base, legal: { ...base.legal, consentPlacement: "popup" as never } })).toThrow();
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

  it("darkMode: false needs no colors.dark; true (the default) still does (D-076)", () => {
    const light = base.brand.tokens.colors.light;
    const brand = (darkMode: boolean | undefined) => ({
      ...base,
      brand: { ...base.brand, darkMode, tokens: { ...base.brand.tokens, colors: { light } } },
    });
    const off = defineProduct(brand(false)).brand;
    expect(off.darkMode).toBe(false);
    expect(off.tokens.colors.dark).toEqual(light); // mirrors light, so a palette lookup never fails
    expect(() => defineProduct(brand(true))).toThrow(/colors.dark is required unless brand.darkMode is false/);
    expect(() => defineProduct(brand(undefined))).toThrow(/colors.dark is required/);
    expect(defineProduct({ ...base, brand: { ...base.brand, darkMode: undefined } }).brand.darkMode).toBe(true);
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

  describe("ai providers (D-083, D-084)", () => {
    const withAi = (ai: unknown, sensitiveDataConsent = false) =>
      defineProduct({ ...base, legal: { ...base.legal, sensitiveDataConsent }, ai } as ProductConfigInput);

    it("openai keeps its shape and defaults", () => {
      expect(withAi({ provider: "openai", model: "gpt-6-luna" }).ai).toEqual({
        provider: "openai",
        model: "gpt-6-luna",
        tier: "default",
        perUserPerDay: 20,
        anonymousPerDay: 300,
      });
    });

    it("openrouter: private routing by default, zdr on with sensitive data", () => {
      const ai = withAi({ provider: "openrouter", model: "google/gemini-3.8-flash" }).ai;
      expect(ai).toMatchObject({
        provider: "openrouter",
        fallbackModels: [],
        prices: {},
        tier: "default",
        routing: { requireParameters: true, dataCollection: "deny", zdr: false },
      });
      const health = withAi({ provider: "openrouter", model: "google/gemini-3.8-flash" }, true).ai;
      expect(health?.provider === "openrouter" && health.routing.zdr).toBe(true);
      // An explicit choice wins, and re-parsing a parsed config gives the same result.
      const off = withAi({ provider: "openrouter", model: "google/gemini-3.8-flash", routing: { zdr: false } }, true);
      expect(off.ai?.provider === "openrouter" && off.ai.routing.zdr).toBe(false);
      expect(defineProduct(JSON.parse(JSON.stringify(off))).ai).toEqual(off.ai);
    });

    it("openrouter: rejects bad slugs and free models", () => {
      for (const model of ["gemini-3.8-flash", "Google/Gemini", "google/gemini-3.8-flash:free"])
        expect(() => withAi({ provider: "openrouter", model }), model).toThrow(/Invalid product.config.ts/);
      expect(() =>
        withAi({ provider: "openrouter", model: "google/gemini-3.8-flash", fallbackModels: ["x/y:free"] }),
      ).toThrow(/free OpenRouter models/);
    });

    it("gemini: a Gemini model id with the documented knobs", () => {
      expect(
        withAi({ provider: "gemini", model: "gemini-3.8-flash", thinking: "low", mediaResolution: "high" }).ai,
      ).toEqual({
        provider: "gemini",
        model: "gemini-3.8-flash",
        thinking: "low",
        mediaResolution: "high",
        tier: "default",
        perUserPerDay: 20,
        anonymousPerDay: 300,
      });
      for (const bad of [
        { model: "gpt-6-luna" },
        { model: "gemini-3.8-flash", thinking: "max" },
        { model: "gemini-3.8-flash", tier: "fast" },
      ])
        expect(() => withAi({ provider: "gemini", ...bad }), JSON.stringify(bad)).toThrow(/Invalid product.config.ts/);
      expect(() => withAi({ provider: "anthropic", model: "x" })).toThrow(/Invalid product.config.ts/);
    });
  });
});
