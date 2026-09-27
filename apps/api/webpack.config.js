const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

// Loaded from node_modules at runtime instead of bundled.
const runtimeExternals = {
  '@google-cloud/storage': 'commonjs @google-cloud/storage',
  // Workflow export. Hoisted to the root node_modules, so Nest's node-externals
  // misses them; bundled, docx has a dynamic require webpack cannot analyse and
  // pdfkit cannot find its font files (read relative to its own directory).
  docx: 'commonjs docx',
  pdfkit: 'commonjs pdfkit',
};

const withRuntimeExternals = (externals) => {
  if (Array.isArray(externals)) {
    return [...externals, runtimeExternals];
  }

  if (externals) {
    return [externals, runtimeExternals];
  }

  return runtimeExternals;
};

module.exports = (options) => ({
  ...options,
  externals: withRuntimeExternals(options.externals),
  resolve: {
    ...options.resolve,
    plugins: [
      ...(options.resolve?.plugins || []),
      new TsconfigPathsPlugin({ configFile: path.resolve(__dirname, 'tsconfig.json') }),
    ],
    extensions: ['.ts', '.js', '.json'],
  },
});
