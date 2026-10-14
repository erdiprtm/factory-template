import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousHomeFor } from "../src/core/auth/anonymous-home-rule";

// D-068: on one domain, a signed-out visitor at "/" goes to the site's landing page instead of
// sign-in. The guard is rendered with a signed-out /api/me and the web helpers mocked.
const domain = { app: "fit.example.id", site: "fit.example.id", anonymousHome: "/mulai/" };

describe("anonymousHomeFor (same rule as the Worker's redirect)", () => {
  it("only / on the production domain, only when set", () => {
    expect(anonymousHomeFor("/", "fit.example.id", domain)).toBe("/mulai/");
    for (const path of ["/account", "/pricing", "/example"])
      expect(anonymousHomeFor(path, "fit.example.id", domain)).toBeNull();
    expect(anonymousHomeFor("/", "myna-fit.acme.workers.dev", domain)).toBeNull();
    expect(anonymousHomeFor("/", "localhost", domain)).toBeNull();
    expect(anonymousHomeFor("/", "fit.example.id", { ...domain, anonymousHome: null })).toBeNull();
  });
});

const nav = vi.hoisted(() => ({ pathname: "/", redirects: [] as string[] }));
const leaveTo = vi.fn();
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    nav.redirects.push(href);
    return null;
  },
  Stack: () => <span>app screens</span>,
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ isPending: false, data: { user: null, missingConsents: [], access: false } }),
}));
vi.mock("../src/core/auth/anonymous-home", () => ({
  anonymousHome: (path: string) => anonymousHomeFor(path, "fit.example.id", domain),
  leaveTo,
}));

// The guard's other neighbours, out of the way.
vi.mock("../src/core/analytics", () => ({ identify: vi.fn() }));
vi.mock("../src/core/attribution", () => ({ sendTouch: vi.fn() }));
vi.mock("../src/core/marketing", () => ({ syncMarketingConsent: vi.fn() }));
vi.mock("../src/core/monitoring", () => ({ setMonitoringUser: vi.fn() }));
vi.mock("../src/core/nav/product-nav", () => ({
  BottomNav: () => null,
  TopNav: () => null,
  useNavPlacement: () => "none",
}));
vi.mock("../src/core/quiz/send", () => ({ sendQuiz: vi.fn() }));
vi.mock("../src/core/quiz/storage", () => ({ takeAfterSignIn: () => null }));

const { default: ProtectedLayout } = await import("../src/app/(app)/_layout");
const { I18nProvider } = await import("../src/core/i18n");

describe("the protected area's guard, signed out", () => {
  beforeEach(() => {
    nav.redirects = [];
    leaveTo.mockClear();
  });
  const renderGuard = () =>
    render(
      <I18nProvider>
        <ProtectedLayout />
      </I18nProvider>,
    );

  it("at / leaves for the landing page with the query string, never to sign-in", async () => {
    nav.pathname = "/";
    renderGuard();
    await vi.waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/mulai/", true));
    expect(nav.redirects).toEqual([]);
    expect(screen.queryByText("app screens")).toBeNull();
  });

  it("on any other screen still goes to sign-in", () => {
    nav.pathname = "/account";
    renderGuard();
    expect(nav.redirects).toEqual(["/sign-in"]);
    expect(leaveTo).not.toHaveBeenCalled();
  });
});
