import { expect, test } from "@playwright/test";
import product from "../../product.config";

// D-065: bundled fonts never hold back the first screen on web. Text renders in the fallback stack
// while the files are still downloading, then the bundled faces swap in. Skipped in products (and
// the template) that use the system font.
const { fonts, fontFamily } = product.brand.tokens;

test("bundled fonts: the first screen shows text before the font files arrive, then swaps them in", async ({
  page,
}) => {
  test.skip(fonts.length === 0, "this product uses the system font");
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = 0;
  await page.route(/\.(ttf|otf)(\?|$)/, async (route) => {
    requested++;
    await held;
    await route.continue();
  });

  await page.goto("/sign-in");
  const label = page.getByRole("button", { name: "Kirim tautan masuk" });
  // Rendered and readable while every font request is still held.
  await expect(label).toBeVisible();
  expect(requested).toBeGreaterThan(0);
  const family = await label.evaluate((el) => {
    const text = el.querySelector("div[dir], span, div") ?? el;
    return getComputedStyle(text).fontFamily;
  });
  expect(family).toContain(`${fontFamily.sans}_`);
  expect(family).toContain("system-ui");
  const face = family.split(",")[0].trim();
  expect(await page.evaluate((f) => document.fonts.check(`16px ${f}`), face)).toBe(false);

  release();
  await expect.poll(() => page.evaluate((f) => document.fonts.check(`16px ${f}`), face)).toBe(true);
});
