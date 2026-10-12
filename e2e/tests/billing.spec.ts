import { expect, test } from "@playwright/test";
import product from "../../product.config";
import { firstPlan, idr, lastPlan } from "./plans";
import { expectAccess, signIn } from "./support";

// Billing E2E with the dev fake provider: sign in → paywall → trial → access; and
// sign in → pricing → pay → return page → access. Real webhook handler, real local D1.

test("free trial unlocks paid access", async ({ page, request }) => {
  test.skip(!product.trial.enabled, "this product has no trial");
  await signIn(page, request, `e2e-trial-${Date.now()}@example.com`);
  await expectAccess(page, false);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  await expectAccess(page, true);
});

test("purchase: pricing → hosted payment → return page → access", async ({ page, request }) => {
  await signIn(page, request, `e2e-buy-${Date.now()}@example.com`);
  await page.goto("/pricing");
  // Small-unit framing and the real payment methods (D-037), from product.config.ts.
  await expect(page.getByText(/≈ Rp[\d.]+\/minggu/).first()).toBeVisible();
  await expect(page.getByText("Bayar dengan")).toBeVisible();
  await page.getByRole("button", { name: `Bayar ${idr(lastPlan.priceIdr)}` }).click();
  await expect(page).toHaveURL(/\/billing\/return\?paymentId=/);
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);
});

// Phase 5 acceptance: trial (or a first purchase, for products without a trial) → access expiry
// (time simulated) → paywall → purchase → access restored.
test("access expiry then purchase restores access", async ({ page, request }) => {
  const email = `e2e-expiry-${Date.now()}@example.com`;
  await signIn(page, request, email);
  await page.goto("/pricing");
  if (product.trial.enabled) await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  else await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await expectAccess(page, true);

  expect((await request.post(`/api/dev/expire-access?email=${encodeURIComponent(email)}`)).status()).toBe(200);
  await expectAccess(page, false);

  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);
});
