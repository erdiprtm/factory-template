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
