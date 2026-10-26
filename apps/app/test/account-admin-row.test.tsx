import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-111: with nav.adminTab false, admins reach /admin from an "Admin" row in Akun. Mocked config
// and slots (D-078, D-103), core keys only.
const s = vi.hoisted(() => ({ isAdmin: true, pushed: [] as string[] }));
vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: Record<string, unknown> }).default;
  return { default: { ...real, nav: { adminTab: false } } };
});
vi.mock("../src/features/slots", () => ({ slots: {} }));
vi.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light", setColorScheme: () => {} }) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: (h: string) => s.pushed.push(h), replace: () => {} }) }));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ data: { user: { email: "a@example.com" }, isAdmin: s.isAdmin, marketingConsent: false } }),
  useRefreshMe: () => async () => {},
}));
const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      account: {
        summary: {
          $get: ok({
            profile: { email: "a@example.com" },
            subscription: { active: false, expiresAt: null, source: null },
          }),
        },
      },
      billing: { history: { $get: ok({ payments: [] }) } },
    },
  },
}));

const { Account } = await import("../src/core/signed-in/account");
const { I18nProvider } = await import("../src/core/i18n");
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <Account />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe("Akun → Admin (nav.adminTab false)", () => {
  it("admins get the row, and it opens /admin", async () => {
    show();
    fireEvent.click(await screen.findByTestId("account-admin"));
    expect(s.pushed).toEqual(["/admin"]);
  });

  it("members don't", async () => {
    s.isAdmin = false;
    const view = show();
    await screen.findByText("a@example.com");
    expect(view.queryByTestId("account-admin")).toBeNull();
    s.isAdmin = true;
  });
});
