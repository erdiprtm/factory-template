import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-113: the dashboard's KPIs with trends, per-day bars, sortable sources and the live feed, with and
// without data. Core keys only; the API is mocked.
const data = vi.hoisted(() => ({
  dashboard: {
    range: "7d",
    from: "2026-10-25",
    to: "2026-10-31",
    kpis: {
      revenueIdr: { value: 500000, trend: 0.25 },
      buyers: { value: 2, trend: -0.5 },
      renewals: { value: 1, trend: 0 },
      visitors: { value: 40, trend: null },
      conversion: { value: 0.05, trend: null },
      activePaid: { value: 7, trend: null },
    },
    series: [
      { day: "2026-10-30", revenueIdr: 0, visitors: 10 },
      { day: "2026-10-31", revenueIdr: 500000, visitors: 30 },
    ],
    sources: [
      {
        source: "meta",
        campaign: "c1",
        visitors: 30,
        firstResults: 5,
        buyers: 1,
        revenueIdr: 100000,
        spendIdr: 50000,
        cacIdr: 50000,
        roas: 2,
      },
      {
        source: null,
        campaign: null,
        visitors: 10,
        firstResults: 1,
        buyers: 1,
        revenueIdr: 400000,
        spendIdr: null,
        cacIdr: null,
        roas: null,
      },
    ],
  } as Record<string, unknown> | null,
  feed: [
    {
      kind: "payment",
      at: "2026-10-31T03:00:00.000Z",
      status: "paid",
      planId: "12m",
      amountIdr: 249000,
      who: "bu***@x.id",
    },
    { kind: "signup", at: "2026-10-31T02:00:00.000Z", who: "an***@x.id" },
  ] as unknown[],
}));
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      admin: {
        dashboard: { $get: async () => ({ ok: true, json: async () => data.dashboard }) },
        feed: { $get: async () => ({ ok: true, json: async () => ({ items: data.feed }) }) },
      },
    },
  },
}));

const { DashboardSection } = await import("../src/core/admin/dashboard");
const { I18nProvider, t } = await import("../src/core/i18n");
const show = () => {
  cleanup();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <DashboardSection />
      </I18nProvider>
    </QueryClientProvider>,
  );
};

describe("admin dashboard", () => {
  it("KPIs with ▲/▼ against the previous period, bars per day, sources and the feed", async () => {
    show();
    expect(await screen.findByText(t("dash.revenue"))).toBeTruthy();
    expect(screen.getByText(`▲ 25% ${t("dash.vsPrevious")}`)).toBeTruthy();
    expect(screen.getByText(`▼ 50% ${t("dash.vsPrevious")}`)).toBeTruthy();
    // Two charts (revenue, visitors) × two days.
    expect(screen.getAllByTestId("bar")).toHaveLength(4);
    // Sorted by revenue first: the direct row (Rp400.000) above meta.
    const rows = () => screen.getAllByTestId("source-row").map((r) => r.textContent ?? "");
    expect(rows()[0]).toContain(t("dash.direct"));
    fireEvent.click(screen.getByRole("button", { name: t("dash.sort.visitors") }));
    expect(rows()[0]).toContain("meta / c1");
    expect(rows()[0]).toContain("ROAS 2.00×");
    const feed = await screen.findAllByTestId("feed-item");
    expect(feed[0]?.textContent).toContain("bu***@x.id");
    expect(feed[1]?.textContent).toContain(t("dash.signup"));
  });

  it("without data: no sources, an empty feed, zero bars still drawn", async () => {
    data.dashboard = {
      ...(data.dashboard as object),
      kpis: Object.fromEntries(
        ["revenueIdr", "buyers", "renewals", "visitors", "conversion", "activePaid"].map((k) => [
          k,
          { value: k === "conversion" ? null : 0, trend: k === "conversion" ? null : 0 },
        ]),
      ),
      series: [{ day: "2026-10-31", revenueIdr: 0, visitors: 0 }],
      sources: [],
    };
    data.feed = [];
    show();
    // Sources and the feed both say there's no data yet.
    await waitFor(() => expect(screen.getAllByText(t("econ.noData"))).toHaveLength(2));
    expect(screen.queryAllByTestId("source-row")).toHaveLength(0);
    expect(screen.getAllByTestId("bar")).toHaveLength(2);
  });
});
