import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-100: a product's own /admin section (e.g. scan feedback) shows to admins only, under the unit
// economics. Its data comes from the product's own requireAdmin-guarded route, not tested here.
const mock = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../src/features/slots", () => ({
  slots: { adminPanel: ({ locale }: { locale: string }) => <p data-testid="panel">{`panel:${locale}`}</p> },
}));
vi.mock("../src/core/admin/economics", () => ({ EconomicsSection: () => <p>economics</p> }));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ isPending: false, data: { user: { email: "a@example.com" }, isAdmin: mock.isAdmin } }),
}));
const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      admin: {
        stats: {
          $get: ok({
            users: 1,
            activeUsers: 1,
            activeBySource: { trial: 0, paid: 1, admin_grant: 0 },
            revenueByMonth: [],
          }),
        },
        payments: { $get: ok({ payments: [] }) },
        webhooks: { $get: ok({ events: [] }) },
        grant: { $post: ok({ ok: true }) },
      },
    },
  },
}));

const { Admin } = await import("../src/core/signed-in/admin");
const { I18nProvider, t } = await import("../src/core/i18n");
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <Admin />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe("/admin product panel slot", () => {
  it("admins see it under the unit economics, with the locale", async () => {
    show();
    const panel = await screen.findByTestId("panel");
    expect(panel.textContent).toMatch(/^panel:(id|en)$/);
    const economics = screen.getByText("economics");
    expect(economics.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("everyone else sees neither the panel nor anything else of /admin", async () => {
    mock.isAdmin = false;
    show();
    await waitFor(() => expect(screen.getByText(t("admin.forbidden"))).toBeTruthy());
    expect(screen.queryByTestId("panel")).toBeNull();
    mock.isAdmin = true;
  });
});
