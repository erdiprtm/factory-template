import type { ProductConfig } from "@factory/config";
import type { ExpoConfig } from "expo/config";

// The Expo app config from product.config.ts (D-119), so a product only edits that one file. Pure,
// so a test checks it without Expo's loader. app.config.ts passes the product's config in.

/** The deep-link scheme: the slug without dashes (e.g. "mynafit"), as since Phase 1. */
export const appScheme = (slug: string) => slug.replaceAll("-", "");

export function expoConfig(product: ProductConfig): ExpoConfig {
  const n = product.native;
  const icon = `./${product.pwa.icon}`;
  const iosPermissions = {
    ...(n.permissions.camera ? { NSCameraUsageDescription: n.permissions.camera } : {}),
    ...(n.permissions.photos ? { NSPhotoLibraryUsageDescription: n.permissions.photos } : {}),
  };
  return {
    name: product.name,
    slug: product.slug,
    scheme: appScheme(product.slug),
    version: n.version,
    // Native code changes need a new store build; the fingerprint says when (EAS Update stays off, D-119).
    runtimeVersion: { policy: "fingerprint" },
    orientation: "portrait",
    userInterfaceStyle: product.brand.darkMode ? "automatic" : "light",
    icon,
    // asyncRoutes was tried and made the web bundle larger (3.1MB common + 1.1MB entry vs 1.8MB), so it stays off.
    // SDK 58 turns asyncRoutes on for web by default; keep it off as before.
    plugins: [["expo-router", { asyncRoutes: false }]],
    ...(n.androidPackage
      ? {
          android: {
            package: n.androidPackage,
            adaptiveIcon: {
              foregroundImage: `./${product.pwa.maskableIcon ?? product.pwa.icon}`,
              backgroundColor: product.brand.tokens.colors.light.background,
            },
          },
        }
      : {}),
    ...(n.iosBundleId
      ? {
          ios: {
            bundleIdentifier: n.iosBundleId,
            supportsTablet: false,
            // Only plain HTTPS and no custom encryption: no export-compliance question per build.
            config: { usesNonExemptEncryption: false },
            infoPlist: iosPermissions,
          },
        }
      : {}),
    ...(n.easProjectId ? { extra: { eas: { projectId: n.easProjectId } } } : {}),
    web: {
      bundler: "metro",
      // One index.html for the Worker's SPA fallback (docs/DECISIONS.md D-013)
      output: "single",
    },
    experiments: {
      typedRoutes: true,
    },
  };
}
