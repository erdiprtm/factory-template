import { expect, test } from "@playwright/test";
import product from "../../product.config";
import { navItem, signIn } from "./support";

// /admin: allowlisted admin (admin@example.com via ADMIN_EMAILS in `pnpm dev`) sees metrics and can grant access.
test("admin sees metrics and grants access", async ({ page, request }) => {
  const member = `e2e-member-${Date.now()}@example.com`;
  await signIn(page, request, member);
  await expect(navItem(page, "/admin")).toHaveCount(0);
  await navItem(page, "/account").click();
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/sign-in$/); // sign-out finished before signing in again

  await signIn(page, request, "admin@example.com");
  // The Admin tab, or with nav.adminTab false the "Admin" row in Akun (D-111).
  if (product.nav.adminTab) await navItem(page, "/admin").click();
  else {
    await navItem(page, "/account").click();
    await page.getByTestId("account-admin").click();
  }
  await expect(page.getByText("Pendapatan per bulan")).toBeVisible();
  await page.getByLabel("Email pengguna").fill(member);
  await page.getByLabel("Jumlah hari").fill("14");
  await page.getByRole("button", { name: "Beri akses" }).click();
  await expect(page.getByText(/^Akses diberikan sampai /)).toBeVisible();

  // Unit economics (D-038): enter spend for a campaign, and it shows up in the numbers.
  const campaign = `e2e-${Date.now()}`;
  await expect(page.getByText("Unit economics iklan")).toBeVisible();
  await page.getByLabel("Nama kampanye (utm_campaign)").fill(campaign);
  await page.getByLabel("Jumlah (Rp, sebelum pajak)").fill("150000");
  await page.getByRole("button", { name: "Simpan biaya" }).click();
  await expect(page.getByText("Tersimpan.")).toBeVisible();
  await expect(page.getByRole("button", { name: campaign })).toBeVisible();
  await expect(page.getByText("Target CAC", { exact: false }).first()).toBeVisible();

  // Delete a user by email (D-110): the email twice, then the member's account is gone.
  await page.getByLabel("Email akun yang dihapus").fill(member);
  await page.getByLabel("Ketik ulang email untuk konfirmasi").fill(member);
  await page.getByRole("button", { name: "Hapus akun permanen" }).click();
  await expect(page.getByText("Akun dihapus.")).toBeVisible();
  await page.getByLabel("Email pengguna").fill(member);
  await page.getByLabel("Jumlah hari").fill("7");
  await page.getByRole("button", { name: "Beri akses" }).click();
  await expect(page.getByText("Pengguna tidak ditemukan.")).toBeVisible();
});
