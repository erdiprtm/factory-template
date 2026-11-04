import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// D-120: the web's "Lanjut di aplikasi" card. Store URLs are passed in, so it holds for whatever
// the product configured; strings come from core keys via t().
const tracked = vi.hoisted(() => [] as [string, Record<string, unknown> | undefined][]);
vi.mock("../src/core/analytics", () => ({
  track: (event: string, props?: Record<string, unknown>) => tracked.push([event, props]),
  initAnalytics: () => Promise.resolve(),
}));
const fetched = vi.hoisted(() => [] as string[]);
vi.mock("../src/core/auth/client", () => ({
  authClient: {
    $fetch: async (path: string) => {
      fetched.push(path);
      return { data: { code: "ABCD2345", expiresAt: new Date().toISOString() }, error: null };
    },
  },
  sessionHeaders: async () => ({}),
}));

async function load() {
  const { AppHandoffCard } = await import("../src/core/signed-in/app-handoff-card");
  const i18n = await import("../src/core/i18n");
  const show = (node: React.ReactNode) => render(<i18n.I18nProvider>{node}</i18n.I18nProvider>);
  return { AppHandoffCard, show, t: i18n.t };
}

beforeAll(async () => {
  await load();
}, 30_000);

describe("AppHandoffCard", () => {
  it("hidden until the product has a store listing", async () => {
    const { AppHandoffCard, show } = await load();
    show(<AppHandoffCard stores={{ play: null, appStore: null }} />);
    expect(screen.queryByTestId("app-handoff")).toBeNull();
  });

  it("the store links it has, and a code on request", async () => {
    const { AppHandoffCard, show, t } = await load();
    show(
      <AppHandoffCard
        stores={{ play: "https://play.google.com/store/apps/details?id=id.example.app", appStore: null }}
      />,
    );
    expect(screen.getByText(t("account.app.play"))).toBeTruthy();
    expect(screen.queryByText(t("account.app.appStore"))).toBeNull();
    fireEvent.click(screen.getByText(t("account.app.getCode")));
    expect((await screen.findByTestId("app-handoff-code")).textContent).toBe("ABCD 2345");
    expect(fetched).toEqual(["/app-handoff/create"]);
  });
});

describe("handoffChars", () => {
  it("keeps letters and digits, upper case, at most 8", async () => {
    const { handoffChars } = await import("../src/core/auth/handoff-form");
    expect(handoffChars("abcd-2345 xyz")).toBe("ABCD2345");
  });
});
