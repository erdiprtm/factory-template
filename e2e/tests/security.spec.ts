import { expect, test } from "@playwright/test";

// Phase 9: the app's HTML ships security headers (apps/app/public/_headers) and runs under its CSP.
test("app HTML has security headers and no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });

  const res = await page.goto("/sign-in");
  const headers = res?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  // The app rendered (styles injected at runtime were allowed).
  await expect(page.getByRole("button", { name: "Kirim tautan masuk" })).toBeVisible();
  expect(violations).toEqual([]);
});
