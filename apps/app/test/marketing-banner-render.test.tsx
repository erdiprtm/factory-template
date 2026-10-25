import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-107: the marketing ask. Two equal buttons, the product's own words, and the product's moment.
// Core keys and a mocked config only (D-078), so it holds in every product repo.
const s = vi.hoisted(() => ({
  askAt: "first_visit" as string,
  copy: {} as Record<string, unknown>,
  signedIn: false,
  choice: null as string | null,
  chosen: [] as string[],
  tracked: [] as string[],
  listeners: new Set<() => void>(),
}));
vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: Record<string, unknown> }).default;
  return {
    default: {
      ...real,
      marketing: {
        metaPixelId: "1234567890",
        // Getters: each test sets its own moment and words.
        consent: {
          get askAt() {
            return s.askAt;
          },
          get copy() {
            return s.copy;
          },
        },
      },
    },
  };
});
vi.mock("../src/core/marketing", () => ({
  marketingActive: async () => true,
  marketingChoice: () => s.choice,
  onMarketingChange: (l: () => void) => {
    s.listeners.add(l);
    return () => s.listeners.delete(l);
  },
  notifyMarketingChange: () => {
    for (const l of s.listeners) l();
  },
  setMarketingChoice: (c: string) => {
    s.choice = c;
    s.chosen.push(c);
  },
  syncMarketingConsent: async () => {},
}));
vi.mock("../src/core/analytics", () => ({ track: (e: string) => s.tracked.push(e) }));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ data: s.signedIn ? { user: { email: "a@example.com" }, marketingConsent: false } : { user: null } }),
}));

async function show(askAt: string, copy: Record<string, unknown> = {}) {
  cleanup();
  vi.resetModules();
  window.localStorage.clear();
  Object.assign(s, { askAt, copy, choice: null, chosen: [], tracked: [] });
  s.listeners.clear();
  const { MarketingBanner } = await import("../src/core/marketing-banner");
  const { I18nProvider } = await import("../src/core/i18n");
  const placement = await import("../src/core/billing/placement");
  const view = render(
    <I18nProvider>
      <MarketingBanner />
    </I18nProvider>,
  );
  await act(async () => {});
  return { view, placement };
}

// Each case re-imports react-native-web (vi.resetModules): on a busy laptop the first is slow (D-080).
describe("marketing consent banner", { timeout: 120_000 }, () => {
  it("first visit: two equal buttons, core words, one tap to decline, counted once", async () => {
    const { t } = await import("../src/core/i18n");
    await show("first_visit");
    const allow = await screen.findByTestId("consent-allow");
    const deny = screen.getByTestId("consent-deny");
    expect(allow.className).toBe(deny.className);
    expect(screen.getByText(t("marketing.banner.allow"))).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(s.tracked).toEqual(["consent_shown"]);
    fireEvent.click(deny);
    expect(s.chosen).toEqual(["denied"]);
    expect(s.tracked).toEqual(["consent_shown", "consent_denied"]);
  });

  it("the product's own words replace core's", async () => {
    await show("first_visit", {
      id: {
        title: "Bantu iklan kami?",
        body: "Kalau kamu izinkan, Meta bisa mengukur iklan kami.",
        allow: "Boleh",
        deny: "Jangan",
      },
      en: {
        title: "Help our ads?",
        body: "If you allow it, Meta can measure our ads for us.",
        allow: "Sure",
        deny: "No",
      },
    });
    expect(await screen.findByText(/Bantu iklan kami\?|Help our ads\?/)).toBeTruthy();
    fireEvent.click(screen.getByText(/^(Boleh|Sure)$/));
    expect(s.chosen).toEqual(["granted"]);
  });

  it("after_first_result: nothing until the first result, then it asks", async () => {
    const { placement } = await show("after_first_result");
    expect(screen.queryByTestId("consent-allow")).toBeNull();
    await act(async () => placement.reportFirstResult());
    expect(await screen.findByTestId("consent-allow")).toBeTruthy();
  });

  it("after_signup: nothing for a visitor, asks once signed in", async () => {
    s.signedIn = false;
    const { view } = await show("after_signup");
    expect(screen.queryByTestId("consent-allow")).toBeNull();
    view.unmount();
    s.signedIn = true;
    await show("after_signup");
    expect(await screen.findByTestId("consent-allow")).toBeTruthy();
    s.signedIn = false;
  });

  it("a choice already made: no banner", async () => {
    cleanup();
    vi.resetModules();
    s.choice = "denied";
    const { MarketingBanner } = await import("../src/core/marketing-banner");
    const { I18nProvider } = await import("../src/core/i18n");
    render(
      <I18nProvider>
        <MarketingBanner />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(screen.queryByTestId("consent-allow")).toBeNull();
  });
});
