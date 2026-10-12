import { describe, expect, it } from "vitest";
import {
  badgeClasses,
  buttonClasses,
  buttonTextClasses,
  cardClasses,
  defaultTokens,
  inputClasses,
  screenClasses,
  textClasses,
  type UiTokens,
} from "./classes";

// D-052: with the default tokens the components render exactly today's classes. Radii and the
// control height moved to per-element CSS variables whose defaults equal the old values
// (rounded-card/button/input = --radius as rounded-lg was; h-control = 3rem as h-12 was).
describe("default classes (snapshot)", () => {
  it("are unchanged", () => {
    expect({
      button: buttonClasses(defaultTokens),
      buttonOutlineLg: buttonClasses(defaultTokens, "outline", "lg"),
      buttonText: buttonTextClasses(defaultTokens),
      card: cardClasses(defaultTokens),
      input: inputClasses(defaultTokens),
      badge: badgeClasses(defaultTokens),
      screen: screenClasses(defaultTokens),
      h1: textClasses(defaultTokens, "h1"),
      h2: textClasses(defaultTokens, "h2"),
      body: textClasses(defaultTokens),
      muted: textClasses(defaultTokens, "muted"),
    }).toMatchInlineSnapshot(`
      {
        "badge": "self-start rounded-chip bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground",
        "body": "text-base text-foreground",
        "button": "flex-row items-center justify-center gap-2 rounded-button web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring bg-primary active:opacity-90 web:hover:opacity-90 h-control px-5",
        "buttonOutlineLg": "flex-row items-center justify-center gap-2 rounded-button web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring border border-input bg-background active:bg-accent web:hover:bg-accent h-14 px-6",
        "buttonText": "text-base font-semibold text-primary-foreground",
        "card": "w-full gap-4 rounded-card border border-border bg-card p-5",
        "h1": "text-3xl font-bold tracking-tight text-foreground",
        "h2": "text-2xl font-semibold tracking-tight text-foreground",
        "input": "h-control w-full rounded-input border border-input bg-background px-4 text-base text-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
        "muted": "text-sm text-muted-foreground",
        "screen": "w-full max-w-lg flex-1 gap-5 self-center px-5 py-8",
      }
    `);
  });
});

describe("tokens change the classes", () => {
  const custom: UiTokens = {
    shadow: "lift",
    density: "compact",
    weights: { heading: "extrabold", body: "medium" },
    fonts: true,
  };

  it("card shadow and density", () => {
    expect(cardClasses(custom)).toContain("shadow-md");
    expect(cardClasses(custom)).toContain("p-4");
    expect(cardClasses(custom)).not.toContain("p-5");
    expect(cardClasses({ ...defaultTokens, shadow: "soft" })).toContain("shadow-sm");
  });

  it("weights and bundled fonts", () => {
    expect(textClasses(custom, "h2")).toContain("font-extrabold");
    expect(textClasses(custom, "h2")).not.toContain("font-semibold");
    expect(textClasses(custom, "h1")).toContain("font-heading");
    expect(textClasses(custom)).toContain("font-medium");
    expect(textClasses(custom)).toContain("font-sans");
    expect(buttonTextClasses(custom)).toContain("font-sans");
  });

  it("screens get tighter when compact", () => {
    expect(screenClasses(custom)).toContain("py-6");
  });
});

describe("cn knows the token utilities", () => {
  it("lets a later class replace a token default", async () => {
    const { cn } = await import("./utils");
    expect(cn("rounded-button h-control px-5", "rounded-2xl h-14")).toBe("px-5 rounded-2xl h-14");
    expect(cn("rounded-card", "rounded-none")).toBe("rounded-none");
    expect(cn("font-sans", "font-heading")).toBe("font-heading");
  });
});

// D-053: a product restyles components from apps/app/src/features/theme.ts, never packages/ui.
describe("product variants", () => {
  const variants = {
    button: {
      variant: { default: "rounded-2xl h-14" },
      size: { sm: "h-11" },
      text: { default: "font-bold text-lg" },
    },
    card: "rounded-3xl border-0 bg-secondary",
    badge: "rounded-md",
    input: "h-14 rounded-2xl",
    text: { h1: "text-4xl font-extrabold" },
  };

  it("make the primary button rounded-2xl h-14 font-bold", () => {
    const button = buttonClasses(defaultTokens, "default", "default", variants);
    expect(button).toContain("rounded-2xl");
    expect(button).toContain("h-14");
    expect(button).not.toContain("rounded-button");
    expect(button).not.toContain("h-control");
    const label = buttonTextClasses(defaultTokens, "default", variants);
    expect(label).toContain("font-bold");
    expect(label).not.toContain("font-semibold");
  });

  it("apply only to the variant and size they name", () => {
    expect(buttonClasses(defaultTokens, "outline", "default", variants)).toContain("rounded-button");
    expect(buttonClasses(defaultTokens, "outline", "sm", variants)).toContain("h-11");
    expect(buttonTextClasses(defaultTokens, "ghost", variants)).toContain("font-semibold");
  });

  it("restyle cards, badges, inputs and headings", () => {
    expect(cardClasses(defaultTokens, variants)).toBe(
      "w-full gap-4 border-border p-5 rounded-3xl border-0 bg-secondary",
    );
    expect(badgeClasses(defaultTokens, variants)).toContain("rounded-md");
    expect(inputClasses(defaultTokens, variants)).toContain("h-14");
    expect(textClasses(defaultTokens, "h1", variants)).toBe("tracking-tight text-foreground text-4xl font-extrabold");
    expect(textClasses(defaultTokens, "h2", variants)).toContain("font-semibold");
  });

  it("change nothing when empty", () => {
    expect(buttonClasses(defaultTokens, "default", "default", {})).toBe(buttonClasses(defaultTokens));
    expect(cardClasses(defaultTokens, {})).toBe(cardClasses(defaultTokens));
  });
});
