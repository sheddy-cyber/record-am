module.exports = function (api) {
  api.cache(true);
  return {
    // import.meta is used by some ESM builds (zustand) that the web bundle picks up.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: ['react-native-reanimated/plugin'],
  };
};
