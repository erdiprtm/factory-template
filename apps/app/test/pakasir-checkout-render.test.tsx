import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PakasirCheckoutProps } from "../src/core/billing/pakasir-checkout";

// D-092: the app's own checkout for Pakasir. The QR is drawn on the device, the VA number can be
// copied, the fee and total are shown, and the countdown ends in the expired state. Strings come
// from core keys via t(), so a product's locale doesn't matter.
vi.mock("../src/core/analytics", () => ({ track: vi.fn(), initAnalytics: () => Promise.resolve() }));

let view: typeof import("../src/core/billing/pakasir-checkout");
let i18n: typeof import("../src/core/i18n");
beforeAll(async () => {
  view = await import("../src/core/billing/pakasir-checkout");
  i18n = await import("../src/core/i18n");
}, 120_000);

const base: PakasirCheckoutProps = {
  method: "qris",
  qrString: "00020101021226610016ID.CO.QRIS.WWW0118936009180021600523520479295303360540599000.005802ID6304A079",
  vaNumber: null,
  amountIdr: 99_000,
  feeIdr: 1003,
  totalIdr: 100_003,
  isSandbox: true,
  remainingMs: 245_000,
  checking: false,
  stillPending: false,
  copied: false,
  onCheck: () => {},
  onCopy: () => {},
  onChangeMethod: () => {},
  onAgain: () => {},
};
const show = (props: Partial<PakasirCheckoutProps> = {}) =>
  render(
    <i18n.I18nProvider>
      <view.PakasirCheckout {...base} {...props} />
    </i18n.I18nProvider>,
  );

describe("PakasirCheckout", () => {
  it("QRIS: the QR drawn on the device, the fee and the total, and the countdown", () => {
    show();
    const qr = screen.getByRole("img", { name: i18n.t("billing.pay.qrLabel") });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    // Many dark modules in one path, drawn here: no <img> from a QR service.
    expect(qr.querySelector("path")?.getAttribute("d")?.split("M").length).toBeGreaterThan(200);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByTestId("total-to-pay").textContent).toBe("Rp100.003");
    expect(screen.getByText("Rp1.003")).toBeTruthy();
    expect(screen.getByText("Rp99.000")).toBeTruthy();
    expect(screen.getByTestId("countdown").textContent).toBe("4:05");
    expect(screen.getByText(i18n.t("billing.pay.sandbox"))).toBeTruthy();
    expect(screen.queryByText(i18n.t("billing.pay.copy"))).toBeNull();
  });

  it("VA: the number with a copy button, no QR", () => {
    const onCopy = vi.fn();
    const { rerender } = show({ method: "bri_va", qrString: null, vaNumber: "880812345678", onCopy, isSandbox: false });
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("va-number").textContent).toBe("880812345678");
    expect(screen.queryByText(i18n.t("billing.pay.sandbox"))).toBeNull();
    fireEvent.click(screen.getByText(i18n.t("billing.pay.copy")));
    expect(onCopy).toHaveBeenCalledTimes(1);
    rerender(
      <i18n.I18nProvider>
        <view.PakasirCheckout {...base} method="bri_va" qrString={null} vaNumber="880812345678" copied />
      </i18n.I18nProvider>,
    );
    expect(screen.getByText(i18n.t("billing.pay.copied"))).toBeTruthy();
  });

  it("'Cek status' and 'Ganti cara bayar' call back; a manual check that found nothing says so", () => {
    const onCheck = vi.fn();
    const onChangeMethod = vi.fn();
    show({ onCheck, onChangeMethod, stillPending: true });
    fireEvent.click(screen.getByText(i18n.t("billing.pay.check")));
    fireEvent.click(screen.getByText(i18n.t("billing.pay.changeMethod")));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onChangeMethod).toHaveBeenCalledTimes(1);
    expect(screen.getByText(i18n.t("billing.pay.stillPending"))).toBeTruthy();
  });

  it("countdown over: no QR or number any more, only 'Pilih paket lagi'", () => {
    const onAgain = vi.fn();
    show({ remainingMs: 0, onAgain });
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(i18n.t("billing.pay.expired"))).toBeTruthy();
    fireEvent.click(screen.getByText(i18n.t("billing.pay.again")));
    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it("formatCountdown", () => {
    expect(view.formatCountdown(245_000)).toBe("4:05");
    expect(view.formatCountdown(3_729_000)).toBe("1:02:09");
    expect(view.formatCountdown(999)).toBe("0:01");
    expect(view.formatCountdown(-5)).toBe("0:00");
  });
});

describe("PlanCards with payments.provider pakasir", () => {
  it("'Bayar' opens the method choice (QRIS first, VAs the price allows), and the method goes to checkout", async () => {
    vi.resetModules();
    const posted: unknown[] = [];
    const opened: string[] = [];
    vi.doMock("../../../product.config", async (orig) => {
      const real = (await orig<typeof import("../../../product.config")>()).default;
      return {
        default: {
          ...real,
          plans: [{ id: "small", label: "Coba", months: 1, priceIdr: 5_000 }, ...real.plans],
          payments: { provider: "pakasir", methods: ["bri_va", "qris", "bni_va"] },
        },
      };
    });
    vi.doMock("../src/core/api", () => ({
      api: {
        api: {
          billing: {
            checkout: {
              $post: async (args: unknown) => {
                posted.push(args);
                return {
                  ok: true,
                  status: 200,
                  json: async () => ({ paymentId: "pay_x", redirectUrl: "/billing/pay?paymentId=pay_x" }),
                };
              },
            },
          },
        },
      },
    }));
    vi.doMock("../src/core/billing/open-checkout", () => ({ openCheckout: (url: string) => opened.push(url) }));
    const { PlanCards } = await import("../src/core/billing/plans");
    const fresh = await import("../src/core/i18n");
    render(
      <fresh.I18nProvider>
        <PlanCards />
      </fresh.I18nProvider>,
    );
    fireEvent.click(screen.getByText(`${fresh.t("pricing.buy")} Rp5.000`));
    // Rp5.000 is under the VA minimum (Rp10.000): QRIS only.
    expect(screen.getByText(fresh.t("billing.pay.choose"))).toBeTruthy();
    expect(screen.queryByText("BRI Virtual Account")).toBeNull();
    fireEvent.click(screen.getByText(fresh.t("billing.pay.back")));

    const real = (await import("../../../product.config")).default.plans[1];
    fireEvent.click(screen.getAllByText(new RegExp(`^${fresh.t("pricing.buy")} Rp`))[1] as HTMLElement);
    const labels = ["QRIS", "BRI Virtual Account", "BNI Virtual Account"];
    const buttons = labels.map((l) => screen.getByText(l));
    // QRIS first, then the VAs in config order.
    expect(buttons[0]?.compareDocumentPosition(buttons[1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(buttons[1]?.compareDocumentPosition(buttons[2] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.click(screen.getByText("BRI Virtual Account"));
    await vi.waitFor(() => expect(opened).toEqual(["/billing/pay?paymentId=pay_x"]));
    expect(posted).toEqual([{ json: expect.objectContaining({ planId: real?.id, method: "bri_va" }) }]);
    // The amount is never sent: the server takes it from the plan.
    expect(JSON.stringify(posted)).not.toMatch(/amount|price/i);
  }, 120_000);
});
