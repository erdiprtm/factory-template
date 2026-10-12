import { createContext, useContext } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { type TextVariant, textClasses } from "../lib/classes";
import { cn } from "../lib/utils";
import { useUiTokens } from "./theme";

export type { TextVariant };

/** Lets a parent (e.g. Button) set the text style of its children. */
export const TextClassContext = createContext<string | undefined>(undefined);

export function Text({ className, variant = "default", ...props }: TextProps & { variant?: TextVariant }) {
  const inherited = useContext(TextClassContext);
  const heading = variant === "h1" || variant === "h2" || variant === "h3";
  return (
    <RNText
      role={heading ? "heading" : undefined}
      className={cn(textClasses(useUiTokens(), variant), inherited, className)}
      {...props}
    />
  );
}
