import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { firstPlan, idr, lastPlan } from "./plans";

// Billing E2E with the dev fake provider: sign in → paywall → trial → access; and
// sign in → pricing → pay → return page → access. Real webhook handler, real local D1.

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();
  const mail = await (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
  await page.goto((mail.text as string).match(/https?:\/\/\S+/)?.[0] as string);
  await expect(page).toHaveURL(/\/consent$/);
  await page.getByLabel("Saya menyetujui Syarat & Ketentuan").click();
  await page.getByLabel("Saya menyetujui Kebijakan Privasi").click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByText(`Masuk sebagai ${email}`)).toBeVisible();
}

test("paid feature: paywall, then free trial unlocks it", async ({ page, request }) => {
  await signIn(page, request, `e2e-trial-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Buka fitur contoh (berbayar)" }).click();
  await expect(page.getByText("Fitur ini untuk pelanggan")).toBeVisible();
  await page.getByRole("button", { name: "Lihat paket" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  await page.goto("/example");
  await expect(page.getByText("Konten berbayar contoh")).toBeVisible();
});

test("purchase: pricing → hosted payment → return page → access", async ({ page, request }) => {
  await signIn(page, request, `e2e-buy-${Date.now()}@example.com`);
  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(lastPlan.priceIdr)}` }).click();
  await expect(page).toHaveURL(/\/billing\/return\?paymentId=/);
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await page.goto("/example");
  await expect(page.getByText("Konten berbayar contoh")).toBeVisible();
});

// Phase 5 acceptance: trial → gated feature → trial expiry (time simulated) → paywall → purchase → access restored.
test("trial expiry then purchase restores access", async ({ page, request }) => {
  const email = `e2e-expiry-${Date.now()}@example.com`;
  await signIn(page, request, email);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Mulai coba gratis/ }).click();
  await page.goto("/example");
  await expect(page.getByText("Konten berbayar contoh")).toBeVisible();

  expect((await request.post(`/api/dev/expire-access?email=${encodeURIComponent(email)}`)).status()).toBe(200);
  await page.goto("/example");
  await expect(page.getByText("Fitur ini untuk pelanggan")).toBeVisible();

  await page.getByRole("button", { name: "Lihat paket" }).click();
  await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();
  await page.goto("/example");
  await expect(page.getByText("Konten berbayar contoh")).toBeVisible();
});
