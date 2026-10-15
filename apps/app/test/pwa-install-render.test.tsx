import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// D-080: the "Pasang di HP" card. Rendered per browser (user agent, display mode, a captured
// beforeinstallprompt), with pwa.promptAfter mocked, so it holds whatever the product configured.
// Strings come from core keys via t(), so a product's own locale or productPwa.offer doesn't matter.
const tracked = vi.hoisted(() => [] as [string, Record<string, unknown> | undefined][]);
vi.mock("../src/core/analytics", () => ({
  track: (event: string, props?: Record<string, unknown>) => tracked.push([event, props]),
  initAnalytics: () => Promise.resolve(),
}));

const UA = {
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.0",
  desktopFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:140.0) Gecko/20100101 Firefox/140.0",
};

function setBrowser(ua: string, standalone = false) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: 0, configurable: true });
  window.matchMedia = ((query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

async function load(promptAfter: "payment" | "first_result" | "never", ua: string, standalone = false) {
  vi.resetModules();
  setBrowser(ua, standalone);
  vi.doMock("../../../product.config", async (importOriginal) => {
    const real = (await importOriginal<typeof import("../../../product.config")>()).default;
    return { default: { ...real, pwa: { ...real.pwa, enabled: true, promptAfter } } };
  });
  const install = await import("../src/core/pwa/install");
  const card = await import("../src/core/pwa/install-card");
  const i18n = await import("../src/core/i18n");
  install.initPwa();
  const show = (node: React.ReactNode) => render(<i18n.I18nProvider>{node}</i18n.I18nProvider>);
  return { install, ...card, t: i18n.t, show };
}

/** Chrome's event, with prompt() stubbed (what the e2e test dispatches too). */
function firePrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

// D-089: transform the card and react-native-web once, with a timeout of its own, so a cold import
// on a busy machine isn't charged to the first case. load()'s vi.resetModules then re-evaluates
// them, which is cheap once they're transformed.
beforeAll(async () => {
  await Promise.all([
    import("../src/core/pwa/install"),
    import("../src/core/pwa/install-card"),
    import("../src/core/i18n"),
  ]);
}, 120_000);

afterEach(() => {
  tracked.length = 0;
  vi.doUnmock("../../../product.config");
  window.localStorage.clear();
});

describe("install offer (D-080)", () => {
  it("Android Chrome: the held event's prompt() runs on Pasang, and nothing shows before the event", async () => {
    const { InstallOffer, show, t } = await load("payment", UA.android);
    show(<InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull(); // no event yet: nothing to offer
    const event = firePrompt();
    expect(event.defaultPrevented).toBe(true); // no browser mini-infobar
    expect(screen.getByTestId("pwa-offer")).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([t("pwa.install"), t("pwa.later")]);
    await act(async () => {
      fireEvent.click(screen.getByText(t("pwa.install")));
    });
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(tracked.map(([e]) => e)).toEqual(["pwa_prompt_shown", "pwa_prompt_accepted"]);
    expect(tracked[0]?.[1]).toEqual({ kind: "prompt", placement: "payment" });
  });

  it("iPhone Safari: Pasang opens the three-step Share guide", async () => {
    const { InstallOffer, show, t } = await load("payment", UA.iphone);
    show(<InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-ios-guide")).toBeNull();
    fireEvent.click(screen.getByText(t("pwa.install")));
    expect(screen.getByTestId("pwa-ios-guide")).toBeTruthy();
    expect(screen.getByText(t("pwa.ios.step1"))).toBeTruthy();
    expect(screen.getByText(t("pwa.ios.step2"))).toBeTruthy();
    expect(t("pwa.ios.step1")).toMatch(/Bagikan|Share/);
  });

  it("in-app browser (Instagram): open in Chrome/Safari, with a copy-link button", async () => {
    const { InstallOffer, show, t } = await load("payment", UA.instagram);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    show(<InstallOffer placement="payment" />);
    expect(screen.getByText(t("pwa.inapp"))).toBeTruthy();
    expect(screen.queryByText(t("pwa.install"))).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText(t("pwa.copy")));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    expect(screen.getByText(t("pwa.copied"))).toBeTruthy();
  });

  it("already installed (display-mode standalone), or nothing to offer: renders nothing", async () => {
    let m = await load("payment", UA.iphone, true);
    m.show(<m.InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull();
    m = await load("payment", UA.desktopFirefox);
    m.show(<m.InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull();
  });

  it("only at the product's moment: promptAfter never or another placement shows nothing", async () => {
    let m = await load("never", UA.iphone);
    m.show(<m.InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull();
    m = await load("first_result", UA.iphone);
    m.show(<m.InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull();
    m.show(<m.InstallOffer placement="first_result" />);
    expect(screen.getByTestId("pwa-offer")).toBeTruthy();
  });

  it("tells the host screen when it's on screen, so that screen keeps one filled button (D-081)", async () => {
    const { InstallOffer, show, t } = await load("payment", UA.iphone);
    const shown = vi.fn();
    show(<InstallOffer placement="payment" onShownChange={shown} />);
    expect(shown).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText(t("pwa.later")));
    expect(shown).toHaveBeenLastCalledWith(false);
  });

  it("Nanti saja hides it for 14 days, then it may show again", async () => {
    const { InstallOffer, install, show, t } = await load("payment", UA.iphone);
    const view = show(<InstallOffer placement="payment" />);
    fireEvent.click(screen.getByText(t("pwa.later")));
    expect(screen.queryByTestId("pwa-offer")).toBeNull();
    expect(tracked.map(([e]) => e)).toEqual(["pwa_prompt_shown", "pwa_prompt_dismissed"]);
    view.unmount();
    show(<InstallOffer placement="payment" />);
    expect(screen.queryByTestId("pwa-offer")).toBeNull(); // still hidden after a reload
    const day = 24 * 60 * 60 * 1000;
    expect(install.offerDismissed(Date.now() + 13 * day)).toBe(true);
    expect(install.offerDismissed(Date.now() + 15 * day)).toBe(false);
  });

  it("Akun's Pasang di HP shows where installing is possible, even after Nanti saja", async () => {
    const { InstallAccountLink, install, show, t } = await load("never", UA.iphone);
    install.dismissOffer();
    show(<InstallAccountLink />);
    fireEvent.click(screen.getByText(t("pwa.account")));
    expect(screen.getByTestId("pwa-ios-guide")).toBeTruthy();
    const m = await load("never", UA.desktopFirefox);
    m.show(<m.InstallAccountLink />);
    expect(screen.queryAllByTestId("pwa-account")).toHaveLength(1); // only the iPhone one above
  });

  it("native builds: the .tsx modules render and offer nothing", async () => {
    vi.resetModules();
    setBrowser(UA.iphone);
    const card = await import("../src/core/pwa/install-card.tsx");
    const install = await import("../src/core/pwa/install.ts");
    const { container } = render(
      <>
        <card.InstallOffer placement="payment" />
        <card.InstallAccountLink />
      </>,
    );
    expect(container.innerHTML).toBe("");
    expect(install.currentInstallKind()).toBeNull();
  });
});

describe("install rules (D-080)", () => {
  it("names the in-app browsers that can't install", async () => {
    const { installKind } = await import("../src/core/pwa/rules");
    const kind = (ua: string, hasPrompt = false) => installKind({ ua, standalone: false, hasPrompt });
    for (const ua of [
      UA.instagram,
      "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 [FBAN/EMA;FBLC/id_ID;FBAV/480.0.0.0;]",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 Version/4.0 Chrome/141.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/15.0.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0 Mobile/15E148 Safari/604.1",
    ])
      expect(kind(ua, true), ua).toBe("inapp");
    expect(kind(UA.android, true)).toBe("prompt");
    expect(kind(UA.android)).toBeNull();
    expect(kind(UA.iphone)).toBe("ios");
    expect(installKind({ ua: UA.iphone, standalone: true, hasPrompt: false })).toBeNull();
    // iPadOS Safari says "Macintosh" but has touch.
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15";
    expect(installKind({ ua: ipad, maxTouchPoints: 5, standalone: false, hasPrompt: false })).toBe("ios");
    expect(installKind({ ua: ipad, maxTouchPoints: 0, standalone: false, hasPrompt: false })).toBeNull();
  });
});
