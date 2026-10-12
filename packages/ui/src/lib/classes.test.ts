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
