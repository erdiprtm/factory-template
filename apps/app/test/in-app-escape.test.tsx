import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARRY_KEY,
  CARRY_MAX,
  decodeCarry,
  detectInApp,
  ESCAPE_PARAM,
  encodeCarry,
  escapeHref,
} from "../src/core/auth/in-app-rules";

// D-121: inside Instagram/TikTok & co., sign-in offers the visitor's real browser first, carrying
// the anonId, attribution and quiz progress, so the magic link lands where the visit is.

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.29.87 (iPhone15,3; iOS 18_5; id_ID)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.108;FBBV/1]",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 trill_370103 BytedanceWebview/d8a21c6",
  threadsIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 389.0.0.29.87 Instagram",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  chrome:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
};

describe("in-app browser rules", () => {
  it("recognises the social apps' browsers and their OS, and not real browsers", () => {
    expect(detectInApp(UA.instagramIos)).toEqual({ app: "instagram", os: "ios" });
    expect(detectInApp(UA.instagramAndroid)).toEqual({ app: "instagram", os: "android" });
    expect(detectInApp(UA.facebookIos)).toEqual({ app: "facebook", os: "ios" });
    expect(detectInApp(UA.tiktokAndroid)).toEqual({ app: "tiktok", os: "android" });
    expect(detectInApp(UA.threadsIos)).toEqual({ app: "threads", os: "ios" });
    expect(detectInApp(UA.safari)).toBeNull();
    expect(detectInApp(UA.chrome)).toBeNull();
  });

  it("builds the per-platform link that opens the default browser, fragment kept", () => {
    const target = "https://app.example.com/sign-in?aid=abc&hx=1#fx=xyz";
    expect(escapeHref(target, { app: "tiktok", os: "android" })).toBe(
      "intent://app.example.com/sign-in?aid=abc&hx=1#fx=xyz#Intent;scheme=https;end",
    );
    expect(escapeHref(target, { app: "instagram", os: "ios" })).toBe(
      `instagram://extbrowser/?url=${encodeURIComponent(target)}`,
    );
    expect(escapeHref(target, { app: "facebook", os: "ios" })).toBe(`x-safari-${target}`);
    expect(escapeHref(target, { app: "facebook", os: "other" })).toBeNull();
  });

  it("carries only the allowed keys, and drops the quiz when it's too big", () => {
    const carry = {
      items: { "factory.quiz.main": '{"answers":{"a":"ya"}}', "factory.afterSignIn": "/pricing", "other.key": "x" },
      landingPath: "/quiz",
    };
    expect(decodeCarry(encodeCarry(carry))).toEqual({
      items: { "factory.quiz.main": '{"answers":{"a":"ya"}}', "factory.afterSignIn": "/pricing" },
      landingPath: "/quiz",
    });
    const big = { items: { "factory.quiz.main": "x".repeat(CARRY_MAX), "factory.firstResult": "1" } };
    expect(decodeCarry(encodeCarry(big))).toEqual({ items: { "factory.firstResult": "1" } });
    expect(decodeCarry("not-base64!")).toBeNull();
    expect(decodeCarry(null)).toBeNull();
  });
});

describe("restoring in the real browser", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("adopts the handed anonId over this browser's own, restores the quiz, and cleans the address bar", async () => {
    window.localStorage.setItem("factory.touch", JSON.stringify({ anonId: "own_browser_id_1234", firstSeenAt: 1 }));
    const fx = encodeCarry({
      items: { "factory.quiz.main": '{"answers":{"a":"ya"},"completedAt":5}', "factory.afterSignIn": "/pricing" },
      landingPath: "/quiz",
    });
    const aid = "handedanonid0123456789";
    window.history.replaceState(
      null,
      "",
      `/sign-in?aid=${aid}&fst=1000&utm_source=ig&${ESCAPE_PARAM}=1#${CARRY_KEY}=${fx}`,
    );
    const { cleanEscapeUrl, restoreEscape } = await import("../src/core/auth/in-app");
    const { currentTouch } = await import("../src/core/attribution");
    restoreEscape();
    cleanEscapeUrl();
    expect(currentTouch()).toMatchObject({ anonId: aid, firstSeenAt: 1000, utm_source: "ig", landingPath: "/quiz" });
    expect(window.localStorage.getItem("factory.quiz.main")).toContain('"completedAt":5');
    expect(window.localStorage.getItem("factory.afterSignIn")).toBe("/pricing");
    expect(window.location.search).not.toContain(ESCAPE_PARAM);
    expect(window.location.hash).toBe("");
    // A reload of the same link (address bar not cleaned yet) doesn't rewind the progress made since.
    window.localStorage.setItem("factory.quiz.main", "newer");
    window.history.replaceState(null, "", `/sign-in?aid=${aid}&${ESCAPE_PARAM}=1#${CARRY_KEY}=${fx}`);
    restoreEscape();
    expect(window.localStorage.getItem("factory.quiz.main")).toBe("newer");
  });

  it("does nothing on a normal visit", async () => {
    window.localStorage.setItem("factory.touch", JSON.stringify({ anonId: "own_browser_id_1234", firstSeenAt: 1 }));
    window.history.replaceState(null, "", "/sign-in?aid=handedanonid0123456789");
    const { restoreEscape } = await import("../src/core/auth/in-app");
    const { currentTouch } = await import("../src/core/attribution");
    restoreEscape();
    expect(currentTouch()?.anonId).toBe("own_browser_id_1234");
  });
});

describe("the escape popup", () => {
  const track = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    track.mockClear();
    vi.doMock("../src/core/analytics", () => ({ track }));
    window.history.replaceState(null, "", "/sign-in");
  });
  afterEach(() => vi.useRealTimers());

  async function setup(os: "ios" | "other") {
    const opened: string[] = [];
    vi.doMock("../src/core/auth/in-app", async (orig) => ({
      ...(await orig<typeof import("../src/core/auth/in-app")>()),
      openOutside: (_i: unknown, target: string) => (os === "other" ? false : (opened.push(target), true)),
      copyLink: async () => true,
    }));
    const { InAppEscape } = await import("../src/core/auth/in-app-escape");
    const { I18nProvider, t } = await import("../src/core/i18n");
    const onStay = vi.fn();
    render(
      <I18nProvider>
        <InAppEscape inApp={{ app: "instagram", os }} onStay={onStay} />
      </I18nProvider>,
    );
    return { opened, onStay, t };
  }

  it("opens on a tap with the touch and the flag, then shows the manual way if still here", async () => {
    vi.useFakeTimers();
    const { opened, t } = await setup("ios");
    expect(track).toHaveBeenCalledWith("inapp_escape_shown", { app: "instagram", os: "ios" });
    fireEvent.click(screen.getByTestId("inapp-open"));
    expect(track).toHaveBeenCalledWith("inapp_escape_tapped", { app: "instagram", os: "ios" });
    const url = new URL(opened[0] ?? "");
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get(ESCAPE_PARAM)).toBe("1");
    expect(url.searchParams.get("aid")).toBeTruthy();
    expect(url.hash.startsWith(`#${CARRY_KEY}=`)).toBe(true);
    await act(async () => vi.advanceTimersByTime(1500));
    expect(screen.getByText(t("auth.inApp.manual"))).toBeTruthy();
  });

  it("without a known way shows the manual steps and copies the link; staying is one tap", async () => {
    const { onStay, t } = await setup("other");
    fireEvent.click(screen.getByTestId("inapp-open"));
    expect(screen.getByText(t("auth.inApp.manual"))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("inapp-copy")));
    expect(screen.getByText(t("auth.inApp.copied"))).toBeTruthy();
    fireEvent.click(screen.getByTestId("inapp-stay"));
    expect(onStay).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("inapp_escape_stayed", expect.objectContaining({ app: "instagram" }));
  });
});
