import "../../global.css";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ErrorBoundaryProps, ErrorBoundary as RouterErrorBoundary, Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import product from "../../../../product.config";
import { initAnalytics } from "../core/analytics";
import { I18nProvider } from "../core/i18n";
import { captureError, initMonitoring } from "../core/monitoring";
import { useRestoreTheme, useThemePreference } from "../core/theme";

/** Expo Router's error screen, plus a report: render errors are caught here, not by window.onerror. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => captureError(props.error), [props.error]);
  return <RouterErrorBoundary {...props} />;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useRestoreTheme();
  useEffect(() => {
    void initMonitoring();
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
