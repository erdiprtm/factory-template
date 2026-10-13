import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolved from apps/app: packages/ui doesn't depend on react-native-web itself (pnpm is strict).
const require = createRequire(import.meta.url);
const rnw = path.dirname(require.resolve("react-native-web/package.json"));

// App tests render React Native components through react-native-web in jsdom (D-058), so slot and
// screen tests can render real core components (and a product's slots) instead of only pure rules.
// Styles aren't under test here (no NativeWind transform): behavior, roles and states are.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: rnw },
      // Native SVG needs native modules; tests only need it to render nothing.
      { find: /^react-native-svg$/, replacement: path.join(import.meta.dirname, "test/stubs/svg.tsx") },
    ],
    // Platform files the way Metro resolves them for web.
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".mjs", ".js", ".json"],
  },
  define: { __DEV__: "true" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
