import type { ExpoConfig } from "expo/config";
import product from "../../product.config.ts";

// App identity comes from product.config.ts so a new product only edits that one file.
const config: ExpoConfig = {
  name: product.name,
  slug: product.slug,
  scheme: product.slug.replaceAll("-", ""),
  version: "0.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  // asyncRoutes was tried and made the web bundle larger (3.1MB common + 1.1MB entry vs 1.8MB), so it stays off.
  plugins: ["expo-router"],
  web: {
    bundler: "metro",
    // One index.html for the Worker's SPA fallback (docs/DECISIONS.md D-013)
    output: "single",
  },
  experiments: {
    typedRoutes: true,
  },
};

export default config;
