import { expect, test } from "@playwright/test";
import { activeExperiment, anonIdIn } from "../../packages/core/src/experiments";
import product from "../../product.config";
import { signIn } from "./support";

// A/B experiments (D-094). Holds in every product repo: skipped unless product.config.ts runs one.
// Each arm is reached through the real assignment path: a fresh device opening the app with an
// anonId in that arm (no "force" switch exists). /admin's split then counts that device in its arm.
const experiment = activeExperiment(product.experiments);

test("each arm's quiz start is counted in its own arm on /admin", async ({ browser, page, request }) => {
  test.skip(!experiment, "this product runs no experiment");
  if (!experiment) return;
  const campaign = `e2e-exp-${Date.now()}`;
  for (const variant of Object.keys(experiment.variants)) {
    const device = await browser.newContext();
    const visitor = await device.newPage();
    const aid = anonIdIn(experiment, variant, `e2e${Date.now().toString(36)}`);
    // The site's steps before the quiz (its sendBeacon), so the sequential funnel reaches quiz_start.
    await request.post("/api/events", {
      headers: { "content-type": "text/plain" },
      data: JSON.stringify({
        anonId: aid,
        utm_campaign: campaign,
        events: [{ event: "lp_view" }, { event: "cta_tap" }],
      }),
    });
    await visitor.goto(`/quiz?aid=${aid}&utm_campaign=${campaign}`);
    if (visitor.url().endsWith("/sign-in")) {
      await device.close();
      return test.skip(true, "this product has no quiz");
    }
    // quiz_start is sent with the device's anonId; the API derives the arm from it.
    await expect.poll(async () => visitor.evaluate(() => window.localStorage.getItem("factory.touch"))).toContain(aid);
    await device.close();
  }

  await signIn(page, request, "admin@example.com");
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/admin/economics?campaign=${campaign}`);
      const body = (await res.json()) as {
        experiment: { variants: { variant: string; funnel: { step: string; visitors: number }[] }[] } | null;
      };
      return body.experiment?.variants.map((v) => [v.variant, v.funnel.find((s) => s.step === "quiz_start")?.visitors]);
    })
    .toEqual(Object.keys(experiment.variants).map((v) => [v, 1]));
});
