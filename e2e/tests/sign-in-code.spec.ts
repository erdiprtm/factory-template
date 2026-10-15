import { expect, type Page, test } from "@playwright/test";
import product from "../../product.config";
import { me } from "./support";

// D-079: the sign-in email's 6-digit code. Someone asks for the email in their browser (A), and the
// link may open in another app (an email app's browser, B). Typing the code in A signs in there.
// Whichever is used first wins: the other stops working.
test.skip(!product.auth.emailCode, "this product has no sign-in code");

async function ask(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText(/^Cek email kamu/)).toBeVisible();
}
async function lastMail(page: Page, email: string) {
  await expect
    .poll(async () => (await page.request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).status())
    .toBe(200);
  const mail = await (await page.request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
  return {
    code: (mail.text as string).match(/\b(\d{6})\b/)?.[1] as string,
    link: (mail.text as string).match(/https?:\/\/\S+/)?.[0] as string,
  };
}
async function acceptConsentsIfAsked(page: Page) {
  if (!(await me(page)).missingConsents.length) return;
  await expect(page).toHaveURL(/\/consent$/);
  for (const box of await page.getByRole("checkbox").all()) await box.click();
  await page.getByRole("button", { name: "Lanjut" }).click();
}

test("the code signs in where the email was asked for; the link opened elsewhere then fails", async ({
  page,
  browser,
}) => {
  const email = `e2e-code-${Date.now()}@example.com`;
  await ask(page, email);
  const { code, link } = await lastMail(page, email);
  expect(code).toMatch(/^\d{6}$/);

  const field = page.getByTestId("sign-in-code");
  await expect(field).toHaveAttribute("autocomplete", "one-time-code");
  await field.fill(code);
  await expect.poll(async () => (await me(page)).user?.email).toBe(email);
  await acceptConsentsIfAsked(page);
  await expect(page).toHaveURL(/\/$/);

  // The email app's browser: a context with no cookies opens the now-used link.
  const other = await browser.newContext();
  const b = await other.newPage();
  await b.goto(link);
  expect((await (await b.request.get("/api/me")).json()).user).toBeNull();
  await other.close();
});

test("a wrong code says so and doesn't sign in; the link still works in the same browser", async ({ page }) => {
  const email = `e2e-code-wrong-${Date.now()}@example.com`;
  await ask(page, email);
  const { code, link } = await lastMail(page, email);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  await page.getByTestId("sign-in-code").fill(wrong);
  await expect(
    page.getByText("Kodenya salah atau sudah tidak berlaku. Coba lagi, atau kirim kode baru."),
  ).toBeVisible();
  expect((await me(page)).user).toBeNull();

  await page.goto(link);
  await expect.poll(async () => (await me(page)).user?.email).toBe(email);
});
