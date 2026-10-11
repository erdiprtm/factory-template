// Expo's default config (monorepo support is automatic) wrapped by NativeWind.
// Absolute paths: NativeWind resolves input/configPath relative to the process cwd.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: path.join(__dirname, "global.css"),
  configPath: path.join(__dirname, "tailwind.config.js"),
  inlineRem: 16,
});
