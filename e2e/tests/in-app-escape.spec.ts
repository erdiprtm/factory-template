import { expect, test } from "@playwright/test";
import product from "../../product.config";

// D-121: inside Instagram's browser, sign-in offers the real browser first. The link it hands over
// opens in a fresh browser with the same anonId and the quiz progress, and a clean address bar.
test.skip(!product.auth.inAppEscape, "this product has no in-app browser escape");

const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.29.87 (iPhone15,3; iOS 18_5; id_ID)";

test("Instagram's browser gets 'Buka di browser'; the real browser continues with the same visit", async ({
  browser,
  baseURL,
}) => {
  const inApp = await browser.newContext({ userAgent: INSTAGRAM_IOS, baseURL });
  await inApp.grantPermissions(["clipboard-read", "clipboard-write"]);
  const a = await inApp.newPage();
  await a.goto("/sign-in");
  const progress = JSON.stringify({ answers: { goal: "e2e" }, completedAt: 1 });
  await a.evaluate((p) => window.localStorage.setItem("factory.quiz.e2e", p), progress);
  const anonId = await a.evaluate(() => JSON.parse(window.localStorage.getItem("factory.touch") ?? "{}").anonId);

  await expect(a.getByText("Lanjut di browser kamu")).toBeVisible();
  // Chromium knows no instagram:// scheme, so the page stays and the manual way shows.
  await a.getByTestId("inapp-open").click();
  await expect(a.getByTestId("inapp-copy")).toBeVisible();
  await a.getByTestId("inapp-copy").click();
  await expect(a.getByText(/^Tautan disalin/)).toBeVisible();
  const target = await a.evaluate(() => navigator.clipboard.readText());
  expect(new URL(target).searchParams.get("hx")).toBe("1");

  const real = await browser.newContext({ baseURL });
  const b = await real.newPage();
  await b.goto(target);
  await expect(b.getByLabel("Email")).toBeVisible();
  await expect(b.getByText("Lanjut di browser kamu")).toHaveCount(0);
  const state = await b.evaluate(() => ({
    anonId: JSON.parse(window.localStorage.getItem("factory.touch") ?? "{}").anonId,
    quiz: window.localStorage.getItem("factory.quiz.e2e"),
    url: window.location.href,
  }));
  expect(state.anonId).toBe(anonId);
  expect(state.quiz).toBe(progress);
  expect(state.url).not.toContain("hx=");
  expect(state.url).not.toContain("#");

  // Staying is one tap and leaves the email form.
  await a.reload();
  await a.getByTestId("inapp-stay").click();
  await expect(a.getByText("Lanjut di browser kamu")).toHaveCount(0);
  await expect(a.getByLabel("Email")).toBeVisible();
  await inApp.close();
  await real.close();
});
