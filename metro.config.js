const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Enable inline requires for faster app cold-start & lighter initial memory footprint
config.transformer = {
  ...config.transformer,
  minifierPath: 'metro-minify-terser',
  minifierConfig: {
    compress: {
      drop_console: process.env.NODE_ENV === 'production',
      drop_debugger: true,
    },
  },
};

module.exports = config;
