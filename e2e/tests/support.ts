import { type APIRequestContext, expect, type Page } from "@playwright/test";

// Template E2E helpers that hold in every product repo (D-032): they never depend on the home
// screen's content or on the example feature, which products replace. Signed-in state and paid
// access are read from /api/me with the page's own cookies.

type Me = { user: { email: string } | null; access: boolean; missingConsents: string[] };

export async function me(page: Page): Promise<Me> {
  return (await page.request.get("/api/me")).json();
}

/** Magic-link sign-in through the dev mail capture; accepts the consents on first sign-in. */
export async function signIn(page: Page, request: APIRequestContext, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim tautan masuk" }).click();
  await expect(page.getByText("Cek email kamu")).toBeVisible();
  const mail = await (await request.get(`/api/dev/last-email?to=${encodeURIComponent(email)}`)).json();
  await page.goto((mail.text as string).match(/https?:\/\/\S+/)?.[0] as string);
  // The session exists as soon as the link is opened; whether consent is still needed comes
  // from the API, not from the URL (the app may pass through "/" before redirecting to /consent).
  await expect.poll(async () => (await me(page)).user?.email).toBe(email);
  if ((await me(page)).missingConsents.length > 0) {
    await expect(page).toHaveURL(/\/consent$/);
    await page.getByLabel("Saya menyetujui Syarat & Ketentuan").click();
    await page.getByLabel("Saya menyetujui Kebijakan Privasi").click();
    await page.getByRole("button", { name: "Lanjut" }).click();
  }
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await me(page)).user?.email).toBe(email);
}

/** Paid access as the API sees it (requireAccess uses the same entitlement check). */
export async function expectAccess(page: Page, access: boolean): Promise<void> {
  await expect.poll(async () => (await me(page)).access).toBe(access);
}
