// NativeWind v4 (docs/DECISIONS.md D-018). babel-preset-expo adds the worklets plugin itself.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
