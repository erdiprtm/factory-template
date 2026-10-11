import { createContext, useContext } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { cn } from "../lib/utils";

/** Lets a parent (e.g. Button) set the text style of its children. */
export const TextClassContext = createContext<string | undefined>(undefined);

const variants = {
  default: "text-base text-foreground",
  h1: "text-3xl font-bold tracking-tight text-foreground",
  h2: "text-2xl font-semibold tracking-tight text-foreground",
  h3: "text-lg font-semibold text-foreground",
  lead: "text-base text-muted-foreground",
  muted: "text-sm text-muted-foreground",
  small: "text-xs text-muted-foreground",
} as const;

export type TextVariant = keyof typeof variants;

export function Text({ className, variant = "default", ...props }: TextProps & { variant?: TextVariant }) {
  const inherited = useContext(TextClassContext);
  const heading = variant === "h1" || variant === "h2" || variant === "h3";
  return (
    <RNText role={heading ? "heading" : undefined} className={cn(variants[variant], inherited, className)} {...props} />
  );
}
