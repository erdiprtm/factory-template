import { expect, test } from "@playwright/test";

// /admin: allowlisted admin (admin@example.com via ADMIN_EMAILS in `pnpm dev`) sees metrics and can grant access.
test("admin sees metrics and grants access", async ({ page, request }) => {
  const signIn = async (email: string) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
    await expect(page.getByText("Cek email kamu")).toBeVisible();
    const mail = await (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
    await page.goto((mail.text as string).match(/https?:\/\/\S+/)?.[0] as string);
    // The app redirects client-side: wait until it settles on consent (first sign-in) or home.
    await expect(page.getByText(/^Sebelum mulai$|^Masuk sebagai /)).toBeVisible();
    if (await page.getByText("Sebelum mulai").isVisible()) {
      await page.getByLabel("Saya menyetujui Syarat & Ketentuan").click();
      await page.getByLabel("Saya menyetujui Kebijakan Privasi").click();
      await page.getByRole("button", { name: "Lanjut" }).click();
    }
    await expect(page.getByText(`Masuk sebagai ${email}`)).toBeVisible();
  };

  const member = `e2e-member-${Date.now()}@example.com`;
  await signIn(member);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.getByRole("link", { name: "Akun" }).click();
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/sign-in$/); // sign-out finished before signing in again

  await signIn("admin@example.com");
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByText("Pendapatan per bulan")).toBeVisible();
  await page.getByLabel("Email pengguna").fill(member);
  await page.getByLabel("Jumlah hari").fill("14");
  await page.getByRole("button", { name: "Beri akses" }).click();
  await expect(page.getByText(/^Akses diberikan sampai /)).toBeVisible();
});
