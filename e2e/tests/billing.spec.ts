import { expect, test } from "@playwright/test";
import product from "../../product.config";
import { firstPlan, idr, lastPlan } from "./plans";
import { buyPlan, expectAccess, signIn } from "./support";

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
  await buyPlan(page, lastPlan.priceIdr);
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
  else await buyPlan(page, firstPlan.priceIdr);
  await expectAccess(page, true);

  expect((await request.post(`/api/dev/expire-access?email=${encodeURIComponent(email)}`)).status()).toBe(200);
  await expectAccess(page, false);

  await page.goto("/pricing");
  await buyPlan(page, firstPlan.priceIdr);
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);
});

// Pakasir's own checkout (D-092), only when this product's provider is pakasir: method choice →
// the QR drawn on the device, fee and total, countdown → "paid" at the fake Pakasir API with no
// webhook, so the screen's own (throttled) poll grants access → return page. Then a VA, its
// number, and "Ganti cara bayar" cancelling it.
test("pakasir: QRIS on our own screen → poll confirms → access; a VA can be swapped", async ({ page, request }) => {
  test.skip(product.payments.provider !== "pakasir", "only for products on Pakasir");
  await signIn(page, request, `e2e-pakasir-${Date.now()}@example.com`);
  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(lastPlan.priceIdr)}` }).click();
  await expect(page.getByText("Pilih cara bayar")).toBeVisible();
  const methods = page.locator('[data-testid^="pay-method-"]');
  if (product.payments.methods.includes("qris"))
    await expect(methods.first()).toHaveAttribute("data-testid", "pay-method-qris");
  await page.getByTestId("pay-method-qris").click();

  await expect(page).toHaveURL(/\/billing\/pay\?paymentId=/);
  await expect(page.getByRole("img", { name: "Kode QR QRIS untuk pembayaran" })).toBeVisible();
  await expect(page.getByText("Biaya layanan pembayaran")).toBeVisible();
  const total = await page.getByTestId("total-to-pay").textContent();
  expect(Number(total?.replace(/\D/g, ""))).toBeGreaterThan(lastPlan.priceIdr);
  await expect(page.getByTestId("countdown")).toHaveText(/^\d+:\d\d(:\d\d)?$/);
  await expect(page.getByText(/sandbox/)).toBeVisible();
  await expectAccess(page, false);

  const paymentId = new URL(page.url()).searchParams.get("paymentId") ?? "";
  expect(await (await request.post(`/api/dev/pakasir-pay?paymentId=${paymentId}`)).json()).toEqual({ ok: true });
  await page.getByRole("button", { name: "Cek status" }).click();
  await expect(page).toHaveURL(/\/billing\/return\?paymentId=/, { timeout: 20_000 });
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await expectAccess(page, true);

  const va = product.payments.methods.find((m) => m.endsWith("_va"));
  test.skip(!va || firstPlan.priceIdr < 10_000, "no VA method for this price");
  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await page.getByTestId(`pay-method-${va}`).click();
  await expect(page).toHaveURL(/\/billing\/pay\?paymentId=/);
  await expect(page.getByTestId("va-number")).toHaveText(/^\d{8,}$/);
  await expect(page.getByRole("button", { name: "Salin nomor" })).toBeVisible();
  const vaPayment = new URL(page.url()).searchParams.get("paymentId") ?? "";
  await page.getByRole("button", { name: "Ganti cara bayar" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  const after = await (await page.request.get(`/api/billing/status?paymentId=${vaPayment}`)).json();
  expect(after.status).toBe("expired");
});
