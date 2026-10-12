import { createContext, type ReactNode, useContext } from "react";
import { defaultTokens, type UiTokens } from "../lib/classes";

// The product's design tokens for @factory/ui (D-052). The app's root layout provides them from
// product.config.ts brand.tokens; without a provider, components look exactly as before.
const UiThemeContext = createContext<UiTokens>(defaultTokens);

export function UiThemeProvider({ tokens, children }: { tokens: UiTokens; children: ReactNode }) {
  return <UiThemeContext.Provider value={tokens}>{children}</UiThemeContext.Provider>;
}

export const useUiTokens = () => useContext(UiThemeContext);
