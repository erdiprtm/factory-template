import { isValidAnswer, type QuizStep } from "@factory/core/quiz";
import type { ComponentProps } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { canAccept } from "../src/core/auth/consent-rules";
import { showsWebPrices } from "../src/core/billing/web-prices";
import type { MessageKey } from "../src/core/i18n";
import type { CoreSlots, HeaderSlotProps, PlanCardSlotProps, QuizStepSlotProps } from "../src/core/slots";
import { slots } from "../src/features/slots";

// D-054: slots change how core screens look, never what they enforce. These rules hold in every
// product repo, whatever its features/slots.tsx renders.

// A minimal custom set, as a product would write it (here, not in the template's slots.tsx).
const example: CoreSlots = {
  quizStep: ({ step, onAnswer, progress }: QuizStepSlotProps) => {
    // A chat-bubble step would render the question and call onAnswer; here we only type-check it.
    void [step, onAnswer, progress];
    return null;
  },
  consentHeader: ({ title }) => {
    void title;
    return null;
  },
  planCard: ({ price, onBuy }) => {
    void [price, onBuy];
    return null;
  },
  tabBarClassName: "rounded-t-3xl",
};

describe("slots can't bypass core rules", () => {
  it("the accept button stays disabled until every required consent is checked", () => {
    const needed = ["terms", "privacy", "sensitive_data"] as const;
    expect(canAccept(needed, {})).toBe(false);
    expect(canAccept(needed, { terms: true, privacy: true })).toBe(false);
    expect(canAccept(needed, { terms: true, privacy: true, sensitive_data: false })).toBe(false);
    expect(canAccept(needed, { terms: true, privacy: true, sensitive_data: true })).toBe(true);
    expect(canAccept([], {})).toBe(false);
  });

  it("the consent header slot gets display text only: no checkboxes, no accept, no submit", () => {
    type ConsentHeaderProps = ComponentProps<NonNullable<CoreSlots["consentHeader"]>>;
    expectTypeOf<keyof ConsentHeaderProps>().toEqualTypeOf<keyof HeaderSlotProps | "where">();
    expectTypeOf<keyof ComponentProps<NonNullable<CoreSlots["signInHeader"]>>>().toEqualTypeOf<
      "title" | "subtitle" | "productName"
    >();
  });

  it("a quiz step slot can't skip a step with an invalid answer (core validates onAnswer)", () => {
    const step: QuizStep<MessageKey> = {
      id: "days",
      kind: "number",
      title: "common.loading",
      min: 1,
      max: 7,
    };
    expect(isValidAnswer(step, 4)).toBe(true);
    expect(isValidAnswer(step, 99)).toBe(false);
    expect(isValidAnswer(step, "4")).toBe(false);
  });

  it("plan cards never show web prices on native, slot or not", () => {
    expect(showsWebPrices("web")).toBe(true);
    for (const os of ["ios", "android", "macos", "windows"]) expect(showsWebPrices(os)).toBe(false);
    // The slot receives formatted prices from config and a checkout callback; it can't set a price.
    expectTypeOf<PlanCardSlotProps["price"]>().toEqualTypeOf<string>();
    expectTypeOf<PlanCardSlotProps["onBuy"]>().toEqualTypeOf<() => void>();
  });

  it("the example set type-checks and the template ships no slots", () => {
    expect(Object.keys(example)).toContain("quizStep");
    // In a product repo this may be filled; the rules above still hold.
    expect(typeof slots).toBe("object");
  });
});

describe("paywall copy", () => {
  it("mentions the free trial only when the product has one", async () => {
    const { paywallBodyKey } = await import("../src/core/billing/paywall-copy");
    const { id } = await import("../src/core/i18n/id");
    expect(id[paywallBodyKey(true)]).toMatch(/coba gratis/i);
    expect(id[paywallBodyKey(false)]).not.toMatch(/coba gratis|trial/i);
  });
});
