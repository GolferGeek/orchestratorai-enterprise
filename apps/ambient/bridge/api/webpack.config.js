const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    plugins: [
      ...(options.resolve?.plugins || []),
      new TsconfigPathsPlugin({ configFile: path.resolve(__dirname, 'tsconfig.json') }),
    ],
    extensions: ['.ts', '.js', '.json'],
  },
});
