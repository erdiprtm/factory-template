import { createContext, type ReactNode, useContext } from "react";
import { defaultTokens, type UiTokens, type UiVariants } from "../lib/classes";

// The product's look for @factory/ui: design tokens from product.config.ts brand.tokens (D-052)
// and class overrides from apps/app/src/features/theme.ts (D-053). The app's root layout provides
// both; without a provider, components look exactly as the template's defaults.
type UiTheme = { tokens: UiTokens; variants: UiVariants };
const UiThemeContext = createContext<UiTheme>({ tokens: defaultTokens, variants: {} });

export function UiThemeProvider({
  tokens,
  variants = {},
  children,
}: {
  tokens: UiTokens;
  variants?: UiVariants;
  children: ReactNode;
}) {
  return <UiThemeContext.Provider value={{ tokens, variants }}>{children}</UiThemeContext.Provider>;
}

export const useUiTokens = () => useContext(UiThemeContext).tokens;
export const useUiVariants = () => useContext(UiThemeContext).variants;
