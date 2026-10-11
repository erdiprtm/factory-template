import { expect, test } from "@playwright/test";
import { signIn } from "./support";

// /admin: allowlisted admin (admin@example.com via ADMIN_EMAILS in `pnpm dev`) sees metrics and can grant access.
test("admin sees metrics and grants access", async ({ page, request }) => {
  const member = `e2e-member-${Date.now()}@example.com`;
  await signIn(page, request, member);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.getByRole("link", { name: "Akun" }).click();
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/sign-in$/); // sign-out finished before signing in again

  await signIn(page, request, "admin@example.com");
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByText("Pendapatan per bulan")).toBeVisible();
  await page.getByLabel("Email pengguna").fill(member);
  await page.getByLabel("Jumlah hari").fill("14");
  await page.getByRole("button", { name: "Beri akses" }).click();
  await expect(page.getByText(/^Akses diberikan sampai /)).toBeVisible();
});
