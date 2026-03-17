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
    alias: {
      ...options.resolve?.alias,
      // Force all @nestjs packages to resolve from Bridge's local node_modules
      // This prevents version mismatches between local v10 and root v11
      '@nestjs/core': path.resolve(__dirname, '../node_modules/@nestjs/core'),
      '@nestjs/common': path.resolve(__dirname, '../node_modules/@nestjs/common'),
      '@nestjs/platform-express': path.resolve(__dirname, '../node_modules/@nestjs/platform-express'),
      '@nestjs/websockets': path.resolve(__dirname, '../node_modules/@nestjs/websockets'),
    },
  },
});
