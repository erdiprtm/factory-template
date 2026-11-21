import { expect, test } from "@playwright/test";
import product from "../../product.config";

// D-130: a one-time digital purchase without an account, in the browser: buy page → the fake
// hosted payment → thank-you page with the download and "sent to <email>" → the download link.
// Runs in products that sell one (config digitalProducts); the template has none.
const item = product.digitalProducts[0];

test("digital purchase: email + consent → pay → thank-you → download", async ({ page, request }) => {
  test.skip(!item, "this product sells no digital products");
  if (!item) return;
  const email = `e2e-ebook-${Date.now()}@example.com`;
  await page.goto(`/beli/${item.id}`);
  await expect(page.getByRole("heading", { name: item.label })).toBeVisible();
  const pay = page.getByTestId("buy-pay");
  await page.getByTestId("buy-email").fill(email);
  await expect(pay).toBeDisabled();
  for (const box of await page.getByRole("checkbox").all()) {
    if ((await box.textContent())?.includes("opsional")) continue;
    await box.click();
  }
  await pay.click();
  await expect(page).toHaveURL(/\/beli\/terima-kasih\?paymentId=pay_[0-9a-f]{32}&k=/);
  await expect(page.getByTestId("download-emailed")).toContainText(email);
  const download = page.getByTestId("download");
  await expect(download).toBeVisible();

  // The link itself: the file when the product's R2 object exists locally, else a clear 404.
  const res = await request.get(
    (await page.evaluate(async () => {
      const q = new URLSearchParams(location.search);
      const r = await fetch(
        `/api/products/status?paymentId=${q.get("paymentId")}&k=${encodeURIComponent(q.get("k") ?? "")}`,
      );
      return ((await r.json()) as { downloadUrl: string }).downloadUrl;
    })) ?? "",
    { headers: { accept: "application/pdf" } },
  );
  expect([200, 404]).toContain(res.status());
  if (res.status() === 404) expect(await res.json()).toEqual({ error: "file_missing" });

  // An unknown link sends a person to the page that emails a new one.
  await page.goto("/api/downloads/garbage");
  await expect(page).toHaveURL(/\/beli\/unduh\?link=invalid/);
  await page.getByTestId("resend-email").fill(email);
  await page.getByTestId("resend-send").click();
  await expect(page.getByTestId("resend-sent")).toBeVisible();
});
