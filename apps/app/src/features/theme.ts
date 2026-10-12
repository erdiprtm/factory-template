// PRODUCT-OWNED: class overrides for @factory/ui components (D-053). Merged after the defaults with
// cn(), so a class here replaces the default it conflicts with and adds the rest. Colors, radii,
// sizes, shadow and fonts are tokens in product.config.ts (brand.tokens); use this for shapes and
// styles tokens don't cover. Empty = the template's look. Example:
//   export const variants: UiVariants = {
//     button: { variant: { default: "rounded-2xl h-14" }, text: { default: "font-bold text-lg" } },
//     card: "border-0 bg-secondary",
//     text: { h1: "text-4xl" },
//   };
import type { UiVariants } from "@factory/ui";

export const variants: UiVariants = {};
