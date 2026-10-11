import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { firstPlan, idr } from "./plans";

// Akun page: subscription status after a purchase, language switch, data export, deletion.

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();
  const mail = await (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
  await page.goto((mail.text as string).match(/https?:\/\/\S+/)?.[0] as string);
  await page.getByLabel("Saya menyetujui Syarat & Ketentuan").click();
  await page.getByLabel("Saya menyetujui Kebijakan Privasi").click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByText(`Masuk sebagai ${email}`)).toBeVisible();
}

test("account: status, history, language, export, delete", async ({ page, request }) => {
  const email = `e2e-account-${Date.now()}@example.com`;
  await signIn(page, request, email);

  // Buy the 6-month plan through the dev payment page.
  await page.goto("/pricing");
  await page.getByRole("button", { name: `Bayar ${idr(firstPlan.priceIdr)}` }).click();
  await expect(page.getByText("Pembayaran berhasil! Akses kamu sudah aktif.")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/^Aktif sampai /)).toBeVisible();
  await expect(page.getByText(idr(firstPlan.priceIdr))).toBeVisible();
  await expect(page.getByText("Berhasil")).toBeVisible();

  // Language switch applies immediately and is remembered.
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByText("Payment history")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Payment history")).toBeVisible();
  await page.getByRole("radio", { name: "Bahasa Indonesia" }).click();

  // Right of access: JSON download.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh data saya (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^data-[a-z0-9-]+\.json$/); // data-<slug>.json

  // Right to erasure: needs the confirmation word, then signs out.
  const deleteButton = page.getByRole("button", { name: "Hapus akun saya" });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel("Ketik HAPUS").fill("HAPUS");
  await deleteButton.click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
