// Expo's default config (monorepo support is automatic) wrapped by NativeWind.
// Absolute paths: NativeWind resolves input/configPath relative to the process cwd.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// One instance of each, always resolved from apps/app. pnpm gives packages/ui its own copies
// (different peer sets), and a second react-native-css-interop keeps its own style store: the
// styles from global.css land in one copy while packages/ui's JSX reads the other, so native
// screens render unstyled (web is unaffected because it uses real CSS). docs/DECISIONS.md D-023.
const SINGLETONS = [
  "react",
  "react-native",
  "nativewind",
  "react-native-css-interop",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-svg",
  "react-native-worklets",
];
const fromApp = path.join(__dirname, "package.json");

// product.config.ts validates itself with Zod (~500 KB of browser JS, D-031). The app gets the
// already-validated JSON written by `pnpm theme` (checked in verify) instead; TypeScript still
// type-checks against product.config.ts.
const PRODUCT_CONFIG = path.resolve(__dirname, "../../product.config.ts");
const PRODUCT_JSON = path.join(__dirname, "src/core/product.generated.json");

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const ctx = singleton ? { ...context, originModulePath: fromApp } : context;
  const resolved = upstream ? upstream(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
  if (resolved.type === "sourceFile" && resolved.filePath === PRODUCT_CONFIG) {
    return { type: "sourceFile", filePath: PRODUCT_JSON };
  }
  return resolved;
};

module.exports = withNativeWind(config, {
  input: path.join(__dirname, "global.css"),
  configPath: path.join(__dirname, "tailwind.config.js"),
  inlineRem: 16,
});
