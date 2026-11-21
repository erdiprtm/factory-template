import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// D-131: a product's digitalBuy slot gets the product with its formatted price and places core's
// pieces itself; digitalThanks gets the status and core's download + resend pieces.
const got = vi.hoisted(() => ({
  buy: null as null | Record<string, unknown>,
  thanks: null as null | Record<string, unknown>,
}));
vi.mock("../src/features/slots", () => ({
  slots: {
    digitalBuy: (p: { product: object; emailField: ReactNode; payButton: ReactNode; agree: ReactNode }) => {
      got.buy = p as Record<string, unknown>;
      return (
        <main data-testid="product-buy">
          <h1>Hero</h1>
          {p.agree}
          {p.emailField}
          {p.payButton}
        </main>
      );
    },
    digitalThanks: (p: { status: string; download: ReactNode; resend: ReactNode }) => {
      got.thanks = p as Record<string, unknown>;
      return (
        <main data-testid="product-thanks">
          <p>Mulai Hari 1</p>
          {p.download}
          {p.resend}
        </main>
      );
    },
  },
}));
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("expo-router", () => ({
  Redirect: () => null,
  useLocalSearchParams: () => params.value,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, canGoBack: () => false }),
}));
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      products: {
        $get: async () => ({
          ok: true,
          json: async () => ({ products: [{ id: "e", label: "E", priceIdr: 149_000 }] }),
        }),
        status: {
          $get: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              status: "paid",
              product: { id: "e", label: "E" },
              email: "b@example.com",
              downloadUrl: null,
            }),
          }),
        },
        resend: { $post: async () => ({ ok: true }) },
        ":id": { checkout: { $post: async () => ({ ok: false }) } },
      },
    },
  },
}));

const { BuyScreen, ThankYouScreen } = await import("../src/core/digital/screens.web");
const { I18nProvider, t } = await import("../src/core/i18n");

describe("digital purchase slots (D-131)", () => {
  it("the buy slot draws the page around core's pieces, with the formatted config price", async () => {
    params.value = { id: "e" };
    render(
      <I18nProvider>
        <BuyScreen />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("product-buy")).toBeTruthy();
    expect(got.buy).toMatchObject({ product: { id: "e", priceIdr: 149_000, priceText: "Rp149.000" }, state: "idle" });
    for (const id of ["buy-email", "buy-pay", "buy-agree"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("the thanks slot gets the status and core's pieces; a used-up link says so", async () => {
    params.value = { paymentId: `pay_${"b".repeat(32)}`, k: "key" };
    render(
      <I18nProvider>
        <ThankYouScreen />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("product-thanks")).toBeTruthy();
    expect(got.thanks).toMatchObject({ status: "paid", email: "b@example.com", slow: false });
    expect(screen.getByText(t("digital.thanks.linkUsed"))).toBeTruthy();
    expect(screen.getByTestId("resend-send")).toBeTruthy();
  });
});
