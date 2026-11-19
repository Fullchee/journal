module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    // Inlines `ENV.*` from .env.schema at bundle time.
    plugins: [require("@varlock/expo-integration/babel-plugin")],
  };
};
