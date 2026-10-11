import { expect, test } from "@playwright/test";
import { firstPlan, idr, lastPlan } from "./plans";
import { expectAccess, signIn } from "./support";

// Billing E2E with the dev fake provider: sign in → paywall → trial → access; and
// sign in → pricing → pay → return page → access. Real webhook handler, real local D1.

test("free trial unlocks paid access", async ({ page, request }) => {
  await signIn(page, request, `e2e-trial-${Date.now()}@example.com`);
  await expectAccess(page, false);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  await expectAccess(page, true);
});

test("purchase: pricing → hosted payment → return page → access", async ({ page, request }) => {
  await signIn(page, request, `e2e-buy-${Date.now()}@example.com`);
  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(lastPlan.priceIdr)}` }).click();
  await expect(page).toHaveURL(/\/billing\/return\?paymentId=/);
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);
});

// Phase 5 acceptance: trial → gated feature → trial expiry (time simulated) → paywall → purchase → access restored.
test("trial expiry then purchase restores access", async ({ page, request }) => {
  const email = `e2e-expiry-${Date.now()}@example.com`;
  await signIn(page, request, email);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  await expectAccess(page, true);

  expect((await request.post(`/api/dev/expire-access?email=${encodeURIComponent(email)}`)).status()).toBe(200);
  await expectAccess(page, false);

  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);
});
