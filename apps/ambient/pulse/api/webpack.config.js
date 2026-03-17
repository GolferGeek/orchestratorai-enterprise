const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = (options) => {
  // Deep-walk module.rules to find ts-loader and add transpileOnly
  function patchTsLoader(rules) {
    if (!rules) return;
    for (const rule of rules) {
      // Direct loader
      if (typeof rule.loader === 'string' && rule.loader.includes('ts-loader')) {
        rule.options = { ...(rule.options || {}), transpileOnly: true };
      }
      // use array
      if (Array.isArray(rule.use)) {
        for (const u of rule.use) {
          if (typeof u === 'string' && u.includes('ts-loader')) {
            // Replace string with object
            const idx = rule.use.indexOf(u);
            rule.use[idx] = { loader: u, options: { transpileOnly: true } };
          } else if (u && typeof u === 'object' && typeof u.loader === 'string' && u.loader.includes('ts-loader')) {
            u.options = { ...(u.options || {}), transpileOnly: true };
          }
        }
      }
      // use object
      if (rule.use && typeof rule.use === 'object' && !Array.isArray(rule.use)) {
        if (typeof rule.use.loader === 'string' && rule.use.loader.includes('ts-loader')) {
          rule.use.options = { ...(rule.use.options || {}), transpileOnly: true };
        }
      }
      // Nested oneOf/rules
      if (rule.oneOf) patchTsLoader(rule.oneOf);
      if (rule.rules) patchTsLoader(rule.rules);
    }
  }

  if (options.module && options.module.rules) {
    patchTsLoader(options.module.rules);
  }

  return {
    ...options,
    resolve: {
      ...options.resolve,
      plugins: [
        ...(options.resolve?.plugins || []),
        new TsconfigPathsPlugin({ configFile: path.resolve(__dirname, 'tsconfig.json') }),
      ],
      extensions: ['.ts', '.js', '.json'],
    },
  };
};
