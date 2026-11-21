import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-131, holds in every product repo: whatever the product's digitalBuy / digitalThanks slots draw
// (features/slots.tsx, real here), the buy page shows core's email field, "Bayar <config price>" and
// the consent line with both documents, and a paid thank-you page shows the download and the resend
// form. Core message keys only (D-028).
const PRODUCT = { id: "contract-ebook", label: "Contract Ebook", priceIdr: 149_000 };
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => <span data-testid="redirect">{href}</span>,
  useLocalSearchParams: () => params.value,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, canGoBack: () => false }),
}));
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      products: {
        $get: async () => ({ ok: true, json: async () => ({ products: [PRODUCT] }) }),
        status: {
          $get: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              status: "paid",
              product: { id: PRODUCT.id, label: PRODUCT.label },
              email: "a@example.com",
              downloadUrl: "/api/downloads/x.y",
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
const { formatIdr } = await import("../src/core/format");
const { legalUrls } = await import("../src/core/auth/legal-links");
const wrap = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>);

describe("digital purchase slots keep core's pieces (D-131)", () => {
  it("buy page: email field, Bayar with the config's price, the consent line with both links", async () => {
    params.value = { id: PRODUCT.id };
    wrap(<BuyScreen />);
    expect(await screen.findByTestId("buy-email")).toBeTruthy();
    expect(screen.getByTestId("buy-pay").textContent).toContain(`${t("digital.pay")} ${formatIdr(PRODUCT.priceIdr)}`);
    const agree = screen.getByTestId("buy-agree");
    expect(agree.textContent).toContain(t("digital.agree"));
    const links = [...agree.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(expect.arrayContaining([legalUrls.terms, legalUrls.privacy]));
  });

  it("paid thank-you page: the download, 'also sent to', and the resend form", async () => {
    params.value = { paymentId: `pay_${"a".repeat(32)}`, k: "key" };
    wrap(<ThankYouScreen />);
    expect(await screen.findByTestId("download")).toBeTruthy();
    expect(screen.getByTestId("download-emailed").textContent).toContain("a@example.com");
    expect(screen.getByTestId("resend-send")).toBeTruthy();
  });
});
