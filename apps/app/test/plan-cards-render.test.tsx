import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-116: tier headings, "+ bonus N bulan" and the founder price (with slots left) from the server.
// Core message keys and core's own plan cards (no product slots), product config mocked (D-078, D-103).
const m = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: Record<string, unknown> }).default;
  return {
    default: {
      ...real,
      pricing: { founderPrice: true, tiers: { peternak: "Peternak", juragan: "Juragan" } },
      plans: [
        { id: "p6", label: "6 bulan", months: 6, priceIdr: 99000, tier: "peternak", bonusMonths: 0 },
        {
          id: "j12",
          label: "12 bulan",
          months: 12,
          priceIdr: 349000,
          tier: "juragan",
          bonusMonths: 2,
          founder: { priceIdr: 199000, limit: 50 },
        },
      ],
    },
  };
});
vi.mock("../src/features/slots", () => ({ slots: {} }));
vi.mock("../src/core/analytics", () => ({ track: vi.fn(), initAnalytics: () => Promise.resolve() }));
vi.mock("react-native", async (orig) => {
  const rn = (await orig()) as { Platform: object };
  return { ...rn, Platform: { ...rn.Platform, OS: "web" } };
});
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      pricing: {
        $get: async () => {
          m.calls++;
          return {
            ok: true,
            json: async () => ({
              plans: [
                { id: "p6", priceIdr: 99000, founder: null },
                { id: "j12", priceIdr: 199000, founder: { priceIdr: 199000, left: 37 } },
              ],
            }),
          };
        },
      },
    },
  },
}));

const { PlanCards } = await import("../src/core/billing/plans");
const { I18nProvider, t } = await import("../src/core/i18n");

describe("PlanCards: tiers, bonus, founder price (D-116)", () => {
  it("groups by tier, shows the bonus, and the founder price with slots left from the server", async () => {
    render(
      <I18nProvider>
        <PlanCards />
      </I18nProvider>,
    );
    expect(screen.getByTestId("tier-peternak").textContent).toBe("Peternak");
    expect(screen.getByTestId("tier-juragan").textContent).toBe("Juragan");
    expect(screen.getByTestId("bonus-j12").textContent).toBe(`${t("pricing.bonus")} 2 ${t("pricing.months")}`);
    expect(screen.queryByTestId("bonus-p6")).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("founder-j12").textContent).toBe(
        `${t("pricing.founder")} · 37 ${t("pricing.founderLeft")}`,
      ),
    );
    expect(m.calls).toBe(1);
    expect(screen.getByText(`${t("pricing.buy")} Rp199.000`)).toBeTruthy();
    expect(screen.getByLabelText(`${t("pricing.normalPrice")} Rp349.000`)).toBeTruthy();
    expect(screen.queryByTestId("founder-p6")).toBeNull();
  });
});
