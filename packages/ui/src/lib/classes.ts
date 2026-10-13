// The classes @factory/ui renders, from the product's design tokens (D-052) and, later, its
// variant overrides (features/theme.ts). Pure functions so the defaults are unit-tested: with the
// default theme they reproduce the template's look exactly.
//
// Every class here is a literal string so Tailwind/NativeWind's content scan sees it.
import { cn } from "./utils";

export type Weight = "normal" | "medium" | "semibold" | "bold" | "extrabold";

export type UiTokens = {
  /** Card elevation. */
  shadow: "none" | "soft" | "lift";
  /** Spacing inside cards and screens. */
  density: "compact" | "regular";
  weights: { heading?: Exclude<Weight, "normal">; body?: Extract<Weight, "normal" | "medium"> };
  /**
   * The bundled font weights per role, or false for the platform font. Each text gets the
   * `font-<role>-<weight>` class nearest to its weight (D-057): native picks fonts by file.
   */
  fonts: false | { sans: number[]; heading: number[] };
};

export const defaultTokens: UiTokens = { shadow: "none", density: "regular", weights: {}, fonts: false };

/**
 * The product's class overrides per component and variant (apps/app/src/features/theme.ts, D-053).
 * Merged last with cn(), so a product class replaces the default it conflicts with (e.g.
 * `rounded-2xl` replaces `rounded-button`) and adds the rest. Empty = the template's look.
 */
export type UiVariants = {
  button?: {
    /** Every button. */
    base?: string;
    variant?: Partial<Record<ButtonVariant, string>>;
    size?: Partial<Record<ButtonSize, string>>;
    /** The button's label, per variant. */
    text?: Partial<Record<ButtonVariant, string>>;
  };
  card?: string;
  badge?: string;
  input?: string;
  text?: Partial<Record<TextVariant, string>>;
};

const WEIGHT: Record<Weight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const WEIGHT_NUM: Record<Weight, number> = { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 };

/** The bundled file nearest to `weight` for the role (ties go to the heavier one), as a class. */
export function fontClass(t: UiTokens, role: "sans" | "heading", weight: number): string | false {
  if (!t.fonts) return false;
  const list = t.fonts[role];
  if (list.length === 0) return false;
  const nearest = list.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) || (Math.abs(w - weight) === Math.abs(best - weight) && w > best)
      ? w
      : best,
  );
  return `font-${role}-${nearest}`;
}

const SHADOW: Record<UiTokens["shadow"], string> = { none: "", soft: "shadow-sm", lift: "shadow-md" };

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "default" | "sm" | "lg";
export type TextVariant = "default" | "h1" | "h2" | "h3" | "lead" | "muted" | "small";

const BUTTON_BASE =
  "flex-row items-center justify-center gap-2 rounded-button web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring";
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: "bg-primary active:opacity-90 web:hover:opacity-90",
  secondary: "bg-secondary active:opacity-80",
  outline: "border border-input bg-background active:bg-accent web:hover:bg-accent",
  ghost: "active:bg-accent web:hover:bg-accent",
  destructive: "bg-destructive active:opacity-90",
  link: "",
};
const BUTTON_SIZE: Record<ButtonSize, string> = { default: "h-control px-5", sm: "h-10 px-4", lg: "h-14 px-6" };
const BUTTON_TEXT: Record<ButtonVariant, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-foreground",
  link: "text-primary underline",
};

const TEXT: Record<TextVariant, string> = {
  default: "text-base text-foreground",
  h1: "text-3xl font-bold tracking-tight text-foreground",
  h2: "text-2xl font-semibold tracking-tight text-foreground",
  h3: "text-lg font-semibold text-foreground",
  lead: "text-base text-muted-foreground",
  muted: "text-sm text-muted-foreground",
  small: "text-xs text-muted-foreground",
};
const isHeading = (v: TextVariant) => v === "h1" || v === "h2" || v === "h3";

export function buttonClasses(
  t: UiTokens,
  variant: ButtonVariant = "default",
  size: ButtonSize = "default",
  v: UiVariants = {},
): string {
  return cn(
    BUTTON_BASE,
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    v.button?.base,
    v.button?.variant?.[variant],
    v.button?.size?.[size],
  );
}

export function buttonTextClasses(t: UiTokens, variant: ButtonVariant = "default", v: UiVariants = {}): string {
  return cn("text-base font-semibold", BUTTON_TEXT[variant], fontClass(t, "sans", 600), v.button?.text?.[variant]);
}

export function cardClasses(t: UiTokens, v: UiVariants = {}): string {
  return cn(
    "w-full gap-4 rounded-card border border-border bg-card p-5",
    t.density === "compact" && "gap-3 p-4",
    SHADOW[t.shadow],
    v.card,
  );
}

export function inputClasses(t: UiTokens, v: UiVariants = {}): string {
  return cn(
    "h-control w-full rounded-input border border-input bg-background px-4 text-base text-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
    fontClass(t, "sans", 400),
    v.input,
  );
}

export function badgeClasses(t: UiTokens, v: UiVariants = {}): string {
  return cn(
    "self-start rounded-chip bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground",
    fontClass(t, "sans", 600),
    v.badge,
  );
}

export function screenClasses(t: UiTokens): string {
  return cn("w-full max-w-lg flex-1 gap-5 self-center px-5 py-8", t.density === "compact" && "gap-4 py-6");
}

export function textClasses(t: UiTokens, variant: TextVariant = "default", v: UiVariants = {}): string {
  const heading = isHeading(variant);
  const weight: Weight = heading
    ? (t.weights.heading ?? (variant === "h1" ? "bold" : "semibold"))
    : (t.weights.body ?? "normal");
  return cn(
    TEXT[variant],
    heading ? t.weights.heading && WEIGHT[t.weights.heading] : t.weights.body && WEIGHT[t.weights.body],
    fontClass(t, heading ? "heading" : "sans", WEIGHT_NUM[weight]),
    v.text?.[variant],
  );
}
