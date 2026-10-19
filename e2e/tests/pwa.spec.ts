import { expect, type Page, test } from "@playwright/test";
import product from "../../product.config";
import { lastPlan } from "./plans";
import { buyPlan, signIn } from "./support";

// Installable web app (D-080). Config-agnostic: the manifest and installability checks run in every
// product with pwa.enabled; the card after a purchase only where pwa.promptAfter is "payment".

test.describe("installable app", () => {
  test.skip(!product.pwa.enabled, "this product turned the installable app off");

  test("serves a valid manifest with the right type, and its icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = await res.json();
    expect(manifest.name).toBe(product.name);
    expect(manifest.start_url).toBe("/?source=pwa");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), "/apple-touch-icon.png"]) {
      const file = await request.get(icon);
      expect(file.status(), icon).toBe(200);
      expect(file.headers()["content-type"], icon).toBe("image/png");
    }
  });

  test("Chrome finds the manifest and reports no installability errors, under the CSP", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    const res = await page.goto("/sign-in");
    expect(res?.headers()["content-security-policy"]).toContain("manifest-src 'self'");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    const cdp = await page.context().newCDPSession(page);
    // Chrome's own checks (DevTools > Application > Manifest), now that Lighthouse 13 has no PWA audits.
    await expect.poll(async () => (await cdp.send("Page.getAppManifest")).url).toMatch(/\/manifest\.webmanifest$/);
    expect((await cdp.send("Page.getAppManifest")).errors).toEqual([]);
    expect((await cdp.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    expect(violations).toEqual([]);
  });
});

/** Chrome's beforeinstallprompt, with prompt() stubbed: marks window.__pwaPrompted when called. */
async function fireInstallPrompt(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => {
      (window as unknown as { __pwaPrompted: boolean }).__pwaPrompted = true;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
}

test("after a purchase: the install card prompts, and Nanti saja hides it on reload", async ({ page, request }) => {
  test.skip(!product.pwa.enabled || product.pwa.promptAfter !== "payment", 'only with pwa.promptAfter "payment"');
  await signIn(page, request, `e2e-pwa-${Date.now()}@example.com`);
  await page.goto("/pricing");
  await buyPlan(page, lastPlan.priceIdr);
  await expect(page).toHaveURL(/\/billing\/return\?paymentId=/);
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();

  const card = page.getByTestId("pwa-offer");
  await expect(card).toHaveCount(0); // Android Chrome before its event: nothing to offer yet
  await fireInstallPrompt(page);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Pasang", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __pwaPrompted?: boolean }).__pwaPrompted))
    .toBe(true);
  await expect(card).toHaveCount(0); // the event is used up

  await fireInstallPrompt(page);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Nanti saja" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await fireInstallPrompt(page);
  await expect(card).toHaveCount(0); // hidden for 14 days
});
