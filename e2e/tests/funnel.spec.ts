import { expect, test } from "@playwright/test";
import { signIn } from "./support";

// Sell engine, Module 1 (D-033): an ad click's attribution survives the sign-in redirect and is
// attached to the user.
test("first-touch attribution from the ad link is attached at sign-in", async ({ page, request }) => {
  const anonId = crypto.randomUUID().replaceAll("-", "");
  await page.goto(`/?utm_source=meta&utm_campaign=e2e-campaign&fbclid=IwAR-e2e&aid=${anonId}`);
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, request, `e2e-attr-${Date.now()}@example.com`);
  await expect
    .poll(async () => (await (await page.request.get("/api/account/export")).json()).attribution)
    .toMatchObject({ anonId, utmSource: "meta", utmCampaign: "e2e-campaign", fbclid: "IwAR-e2e" });
});
