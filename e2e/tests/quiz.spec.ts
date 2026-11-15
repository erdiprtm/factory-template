import { expect, test } from "@playwright/test";
import product from "../../product.config";
import { hasQuiz, me, signIn } from "./support";

// "Pay for proof" products (D-042/D-043) ask for consent before the quiz and lead to their public
// entry screen instead of sign-in. Same rule as the app (billing/placement.ts): whenever one is set,
// also with 0 free uses (a public story or demo screen, D-125).
const anonymousEntry = product.funnel.anonymousEntry;
// D-074: or one row inside the quiz (first or last question) instead of a screen before it.
const inlineConsent = anonymousEntry !== null && product.legal.consentPlacement !== "screen";

// Sell engine Module 4 (D-036). Product-independent: answers whatever quiz the product defines
// (first option / lowest number), so it holds in every product repo.
test("quiz: lander CTA → steps with back → summary → sign-in → answers attached", async ({ page, request }) => {
  // /api/me decides whether consent is still needed: wait for it so the consent row's visibility is final.
  const meLoaded = page.waitForResponse((r) => r.url().includes("/api/me"));
  await page.goto("/quiz");
  if (!(await hasQuiz(page))) return test.skip(true, "this product has no quiz");
  await meLoaded;
  const infoNext = page.getByTestId("quiz-info-next");
  // Intro screens (D-129) come before the consent screen.
  if (anonymousEntry && !inlineConsent) {
    while (!(await page.getByTestId("anon-consent-continue").isVisible())) {
      await expect(infoNext.or(page.getByTestId("anon-consent-continue"))).toBeVisible();
      if (await infoNext.isVisible()) await infoNext.click();
    }
    await expect(page.getByTestId("anon-consent-continue")).toBeVisible();
    for (const box of await page.getByRole("checkbox").all()) await box.click();
    await page.getByTestId("anon-consent-continue").click();
  }
  const summary = page.getByRole("heading", { name: "Rencana kamu siap" });
  const next = page.getByTestId("quiz-next");
  let consentRows = 0;
  const answerStep = async () => {
    // An info screen (D-129): nothing to answer.
    await expect(infoNext.or(page.getByTestId("quiz-option").first()).or(page.locator("input")).first()).toBeVisible();
    if (await infoNext.isVisible()) return infoNext.click();
    // The inline consent row (under the first or last question): its step can't be answered before
    // the box(es) are ticked.
    const row = page.getByTestId("inline-consent");
    if (inlineConsent && (await row.isVisible())) {
      consentRows++;
      for (const box of await row.getByRole("checkbox").all()) {
        await expect(box).toHaveAttribute("aria-checked", "false");
        await box.click();
        await expect(box).toHaveAttribute("aria-checked", "true");
      }
    }
    // A free-text step (D-125): any short answer.
    const text = page.getByTestId("quiz-text");
    if (await text.isVisible()) {
      if ((await text.inputValue()) === "") await text.fill("Budi");
      await next.click();
      return;
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

  // Intro screens before a consent screen were passed above: continue from where the quiz is.
  const progress = page.getByText(/Langkah \d+ dari \d+/);
  const start = Number(((await progress.textContent()) ?? "").match(/\d+/)?.[0] ?? "1");
  // At most 16 questions + 8 info screens (QUIZ_MAX_STEPS + QUIZ_MAX_INFO, D-129).
  for (let step = start; step < start + 24; step++) {
    // Wait for this screen or the summary: after the last screen (also an info screen, D-129) the
    // summary takes a moment, and an instant isVisible() check would miss it.
    const here = page.getByText(new RegExp(`Langkah ${step} dari`));
    await expect(here.or(summary)).toBeVisible();
    if (await summary.isVisible()) break;
    await answerStep();
    if (step === start + 1) {
      // Back keeps earlier answers: go back one screen and forward again.
      await page.getByTestId("quiz-back").click();
      await expect(page.getByText(new RegExp(`Langkah ${step} dari`))).toBeVisible();
      await answerStep();
    }
  }
  await expect(summary).toBeVisible();
  // The row was under its question (the first or the last), and its boxes were ticked there.
  if (inlineConsent) expect(consentRows).toBeGreaterThan(0);
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
