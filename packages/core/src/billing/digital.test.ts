import { describe, expect, it } from "vitest";
import { currentDigitalPrice } from "./digital";

// D-136: a sale's price until its end (inclusive), then the normal price; decided by the server clock.
describe("currentDigitalPrice", () => {
  const ebook = {
    priceIdr: 149_000,
    sale: { priceIdr: 89_000, until: "2026-12-31T23:59:59+07:00", label: "Diskon akhir tahun · sampai 31 Des" },
  };

  it("charges the sale price until it ends, with the normal one to strike through", () => {
    expect(currentDigitalPrice(ebook, new Date("2026-12-31T16:59:59Z"))).toEqual({
      priceIdr: 89_000,
      listPriceIdr: 149_000,
      saleUntil: ebook.sale.until,
      saleLabel: ebook.sale.label,
    });
  });

  it("goes back to the normal price right after (WIB midnight)", () => {
    expect(currentDigitalPrice(ebook, new Date("2026-12-31T17:00:00Z"))).toEqual({
      priceIdr: 149_000,
      listPriceIdr: null,
      saleUntil: null,
      saleLabel: null,
    });
  });

  it("a product without a sale is its price", () => {
    expect(currentDigitalPrice({ priceIdr: 149_000 }).priceIdr).toBe(149_000);
  });
});
