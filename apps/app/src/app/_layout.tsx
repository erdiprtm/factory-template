import "../../global.css";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import product from "../../../../product.config";
import { initAnalytics } from "../core/analytics";
import { I18nProvider } from "../core/i18n";
import { useRestoreTheme, useThemePreference } from "../core/theme";

export { ErrorBoundary } from "expo-router";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useRestoreTheme();
  useEffect(() => {
    void initAnalytics();
  }, []);
  const { colorScheme } = useThemePreference();
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <Head>
          <title>{product.name}</title>
          <meta name="description" content={product.tagline} />
        </Head>
        <View className="flex-1 bg-background">
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }} />
        </View>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <PortalHost />
      </QueryClientProvider>
    </I18nProvider>
  );
}
