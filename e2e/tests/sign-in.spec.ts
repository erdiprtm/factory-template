import { expect, test } from "@playwright/test";
import { me } from "./support";

// Phase 3 acceptance: magic-link sign-in end to end, with the dev mail capture.
test("magic link sign-in → consent → home → sign out", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();

  const mail = await expect
    .poll(async () => (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).status())
    .toBe(200)
    .then(async () => (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json());
  expect(mail.subject).toMatch(/^Masuk ke /);
  const link = (mail.text as string).match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();

  await page.goto(link as string);
  await expect(page).toHaveURL(/\/consent$/);
  const continueButton = page.getByRole("button", { name: "Lanjut" });
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("Saya menyetujui Syarat & Ketentuan").click();
  await page.getByLabel("Saya menyetujui Kebijakan Privasi").click();
  await continueButton.click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await me(page)).user?.email).toBe(email);

  await page.getByRole("link", { name: "Akun" }).click();
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a used magic link can't sign in twice", async ({ page, request, browser }) => {
  const email = `e2e-reuse-${Date.now()}@example.com`;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();
  const mail = await (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
  const link = (mail.text as string).match(/https?:\/\/\S+/)?.[0] as string;

  await page.goto(link);
  await expect(page).toHaveURL(/\/consent$/);

  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(link);
  await expect(second).not.toHaveURL(/\/consent$/);
  await other.close();
});
