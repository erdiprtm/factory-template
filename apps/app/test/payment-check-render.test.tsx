import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// D-128: "Saya sudah bayar, cek status". The button asks POST /api/billing/check and says what
// came back; a paid answer refreshes the session and calls onPaid. Core keys only (D-028).
vi.mock("../src/core/analytics", () => ({ track: vi.fn(), initAnalytics: () => Promise.resolve() }));
vi.mock("../src/features/slots", () => ({ slots: {} }));
const answer = vi.hoisted(() => ({ body: {} as Record<string, unknown>, sent: [] as unknown[] }));
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      billing: {
        check: {
          $post: async (req: { json: unknown }) => {
            answer.sent.push(req.json);
            return { ok: true, status: 200, json: async () => answer.body };
          },
        },
      },
    },
  },
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../src/core/auth/use-me", () => ({ useRefreshMe: () => refresh }));

let view: typeof import("../src/core/billing/payment-check");
let i18n: typeof import("../src/core/i18n");
beforeAll(async () => {
  view = await import("../src/core/billing/payment-check");
  i18n = await import("../src/core/i18n");
}, 120_000);

const show = (props: { paymentId?: string; onPaid?: () => void } = {}) =>
  render(
    <i18n.I18nProvider>
      <view.PaymentCheckButton {...props} />
    </i18n.I18nProvider>,
  );

describe("PaymentCheckButton", () => {
  it("paid: refreshes access and calls onPaid", async () => {
    answer.body = {
      paymentId: "pay_a",
      status: "paid",
      checked: true,
      accessUntil: "2026-12-11T00:00:00Z",
      retryAfterSec: null,
    };
    const onPaid = vi.fn();
    show({ paymentId: "pay_a", onPaid });
    fireEvent.click(screen.getByText(i18n.t("billing.check.button")));
    await waitFor(() => expect(screen.getByText(i18n.t("billing.check.paid"))).toBeTruthy());
    expect(answer.sent.at(-1)).toEqual({ paymentId: "pay_a" });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });

  it("throttled: says when to try again; webhook-only providers say it updates by itself", async () => {
    answer.body = { paymentId: "pay_b", status: "pending", checked: true, accessUntil: null, retryAfterSec: 15 };
    show();
    fireEvent.click(screen.getByText(i18n.t("billing.check.button")));
    await waitFor(() => expect(screen.getByText(i18n.t("billing.check.wait").replace("{seconds}", "15"))).toBeTruthy());
    expect(answer.sent.at(-1)).toEqual({});
    const t = (k: Parameters<typeof i18n.t>[0]) => i18n.t(k);
    expect(
      view.paymentCheckMessage(t, {
        paymentId: "p",
        status: "pending",
        checked: false,
        accessUntil: null,
        retryAfterSec: null,
      }),
    ).toBe(i18n.t("billing.check.webhookOnly"));
  });
});
