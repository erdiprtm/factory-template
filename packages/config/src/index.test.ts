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

  it("rejects slugs that can't be Worker names", () => {
    expect(() => defineProduct({ ...base, slug: "Bad_Slug" })).toThrow(/slug/);
  });
});
