import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { defineProduct, type ProductConfigInput } from "./index";

const base: ProductConfigInput = JSON.parse(JSON.stringify(product));

describe("defineProduct", () => {
  it("accepts the template's product.config.ts", () => {
    expect(product.slug).toBe("factory-template");
    expect(product.plans.map((p) => p.id)).toEqual(["6m", "12m"]);
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
