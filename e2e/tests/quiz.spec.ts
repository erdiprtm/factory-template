import { expect, test } from "@playwright/test";
import product from "../../product.config";
import { me, signIn } from "./support";

// "Pay for proof" products (D-042/D-043) ask for consent before the quiz and lead to their public
// entry screen instead of sign-in.
const anonymousEntry = product.funnel.anonymousFreeUses > 0 ? product.funnel.anonymousEntry : null;
// D-074: or one row inside the quiz (first or last question) instead of a screen before it.
const inlineConsent = anonymousEntry !== null && product.legal.consentPlacement !== "screen";

// Sell engine Module 4 (D-036). Product-independent: answers whatever quiz the product defines
// (first option / lowest number), so it holds in every product repo.
test("quiz: lander CTA → steps with back → summary → sign-in → answers attached", async ({ page, request }) => {
  await page.goto("/quiz");
  if (page.url().endsWith("/sign-in")) return test.skip(true, "this product has no quiz");
  if (anonymousEntry && !inlineConsent) {
    await expect(page.getByTestId("anon-consent-continue")).toBeVisible();
    for (const box of await page.getByRole("checkbox").all()) await box.click();
    await page.getByTestId("anon-consent-continue").click();
  }
  const summary = page.getByRole("heading", { name: "Rencana kamu siap" });
  const next = page.getByTestId("quiz-next");
  const answerStep = async () => {
    // The inline consent row: its step can't be answered before the box(es) are ticked.
    const row = page.getByTestId("inline-consent");
    if (inlineConsent) {
      // The row's step: the first question, or the last ("Langkah N dari N").
      const [n, total] = ((await page.getByText(/Langkah \d+ dari \d+/).textContent()) ?? "").match(/\d+/g) ?? [];
      const here = product.legal.consentPlacement === "quiz_first" ? n === "1" : n === total;
      if (here) await expect(row).toBeVisible();
    }
    if (inlineConsent && (await row.isVisible())) {
      for (const box of await row.getByRole("checkbox").all()) {
        await expect(box).toHaveAttribute("aria-checked", "false");
        await box.click();
        await expect(box).toHaveAttribute("aria-checked", "true");
      }
    }
    const number = page.getByTestId("quiz-number");
    if (await number.isVisible()) {
      await number.fill("1");
      await next.click();
      // 1 may be below the step's minimum: then use the minimum the error message names.
      const range = page.getByText(/Masukkan angka antara \d+/);
      if (await range.isVisible()) {
        await number.fill((await range.textContent())?.match(/antara (\d+)/)?.[1] ?? "1");
        await next.click();
      }
      return;
    }
    const first = page.getByTestId("quiz-option").first();
    const multi = await next.isVisible();
    // After "back", a multi-choice step keeps its answer: don't toggle it off again.
    if (!multi || (await first.getAttribute("aria-checked")) !== "true") await first.click();
    if (multi) await next.click();
  };

  for (let step = 1; step <= 8 && !(await summary.isVisible()); step++) {
    await expect(page.getByText(new RegExp(`Langkah ${step} dari`))).toBeVisible();
    await answerStep();
    if (step === 2) {
      // Back keeps earlier answers: go back to step 2 and forward again.
      await page.getByTestId("quiz-back").click();
      await expect(page.getByText(/Langkah 2 dari/)).toBeVisible();
      await answerStep();
    }
  }
  await expect(summary).toBeVisible();
  await page.getByTestId("quiz-done").click();
  if (anonymousEntry) {
    await expect(page).toHaveURL(new RegExp(`${anonymousEntry}$`));
  } else {
    await expect(page).toHaveURL(/\/sign-in$/);
  }

  await signIn(page, request, `e2e-quiz-${Date.now()}@example.com`);
  await expect
    .poll(
      async () => ((await (await page.request.get("/api/quiz")).json()) as { responses: unknown[] }).responses.length,
    )
    .toBe(1);
  expect((await me(page)).user).not.toBeNull();
});
