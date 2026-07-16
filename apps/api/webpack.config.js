const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const optionalProviderExternals = {
  '@google-cloud/storage': 'commonjs @google-cloud/storage',
};

const withOptionalProviderExternals = (externals) => {
  if (Array.isArray(externals)) {
    return [...externals, optionalProviderExternals];
  }

  if (externals) {
    return [externals, optionalProviderExternals];
  }

  return optionalProviderExternals;
};

module.exports = (options) => ({
  ...options,
  externals: withOptionalProviderExternals(options.externals),
  resolve: {
    ...options.resolve,
    plugins: [
      ...(options.resolve?.plugins || []),
      new TsconfigPathsPlugin({ configFile: path.resolve(__dirname, 'tsconfig.json') }),
    ],
    extensions: ['.ts', '.js', '.json'],
  },
});
