import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// D-124, from Myna Fit's screen audit: every core screen has a way out, the quiz says why an answer
// didn't go on, a stuck payment return can check again, Akun takes product cards and asks before
// signing out. Mocked config and slots (D-078, D-103), core keys only.
const s = vi.hoisted(() => ({
  canGoBack: false,
  calls: [] as string[],
  slots: {} as Record<string, unknown>,
  summaryOk: true,
  status: "pending" as string,
}));
vi.mock("../src/features/slots", () => ({ slots: s.slots }));
vi.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light", setColorScheme: () => {} }) }));
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => <span data-testid="redirect">{href}</span>,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    canGoBack: () => s.canGoBack,
    back: () => s.calls.push("back"),
    replace: (h: string) => s.calls.push(`replace:${h}`),
    push: (h: string) => s.calls.push(`push:${h}`),
  }),
}));
vi.mock("../src/core/auth/anonymous-home", () => ({
  anonymousHome: () => null,
  siteLanding: () => "https://example.com/",
  leaveTo: (url: string) => s.calls.push(`leave:${url}`),
}));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({
    isPending: false,
    data: { user: { email: "a@example.com" }, isAdmin: false, marketingConsent: false, missingConsents: [] },
  }),
  useRefreshMe: () => async () => {},
}));
vi.mock("../src/core/auth/client", () => ({ authClient: { signOut: async () => s.calls.push("signOut") } }));
vi.mock("../src/core/analytics", () => ({ track: () => {}, resetAnalytics: () => {} }));
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      account: {
        summary: {
          $get: async () =>
            s.summaryOk
              ? {
                  ok: true,
                  json: async () => ({
                    profile: { email: "a@example.com" },
                    subscription: { active: false, expiresAt: null, source: null },
                  }),
                }
              : { ok: false, status: 500 },
        },
      },
      billing: {
        history: { $get: async () => ({ ok: true, json: async () => ({ payments: [] }) }) },
        status: { $get: async () => ({ ok: true, json: async () => ({ status: s.status }) }) },
      },
    },
  },
}));

const { BackLink } = await import("../src/core/nav/back-link");
const { Account } = await import("../src/core/signed-in/account");
const { BillingReturn } = await import("../src/core/signed-in/billing-return");
const { I18nProvider, t } = await import("../src/core/i18n");
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  s.canGoBack = false;
  s.calls = [];
  s.summaryOk = true;
  for (const k of Object.keys(s.slots)) delete s.slots[k];
});

describe("a way out of every core screen", () => {
  it("back in history first, else the landing page, else the app path; nothing when there's nowhere", () => {
    s.canGoBack = true;
    const a = wrap(<BackLink leave="https://example.com/" />);
    fireEvent.click(screen.getByTestId("back-link"));
    a.unmount();
    s.canGoBack = false;
    const b = wrap(<BackLink leave="https://example.com/" />);
    fireEvent.click(screen.getByTestId("back-link"));
    b.unmount();
    const c = wrap(<BackLink fallback="/account" />);
    fireEvent.click(screen.getByTestId("back-link"));
    c.unmount();
    expect(s.calls).toEqual(["back", "leave:https://example.com/", "replace:/account"]);
    wrap(<BackLink leave={null} />);
    expect(screen.queryByTestId("back-link")).toBeNull();
  });
});

describe("Akun", () => {
  it("is titled like its tab, takes the product's cards, and asks before signing out", async () => {
    s.slots.accountSections = () => <span data-testid="product-card">Target & goal</span>;
    wrap(<Account />);
    expect(await screen.findByTestId("product-card")).toBeTruthy();
    expect(screen.getByText(t("nav.account"))).toBeTruthy();
    fireEvent.click(screen.getByTestId("sign-out"));
    expect(s.calls).not.toContain("signOut");
    expect(screen.getByText(t("auth.signOutConfirm"))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("sign-out-yes")));
    expect(s.calls).toContain("signOut");
  });

  it("an error has a retry button", async () => {
    s.summaryOk = false;
    wrap(<Account />);
    const retry = await screen.findByTestId("account-retry");
    s.summaryOk = true;
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("sign-out")).toBeTruthy());
  });
});

describe("payment return never strands the buyer", () => {
  it("without a payment id: no spinner forever, a way home at once", () => {
    wrap(<BillingReturn />);
    expect(screen.getByText(t("billing.return.timeout"))).toBeTruthy();
    fireEvent.click(screen.getByTestId("billing-home"));
    expect(s.calls).toEqual(["replace:/"]);
    expect(screen.queryByTestId("billing-retry")).toBeNull();
  });
});
