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
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const ctx = singleton ? { ...context, originModulePath: fromApp } : context;
  return upstream ? upstream(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: path.join(__dirname, "global.css"),
  configPath: path.join(__dirname, "tailwind.config.js"),
  inlineRem: 16,
});
