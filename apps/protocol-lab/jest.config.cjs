const { resolve } = require('path');

/**
 * Root Jest configuration for Protocol Lab.
 * Uses CommonJS so `__dirname` is available when Jest loads the config as ESM.
 */
const root = __dirname;

/** @type {import('jest').Config} */
const config = {
  projects: [
    resolve(root, 'packages/shared-protocols/jest.config.js'),
    resolve(root, 'packages/shared-types/jest.config.js'),
    resolve(root, 'apps/prairie-ridge-app/jest.config.js'),
    resolve(root, 'apps/buildwell-app/jest.config.js'),
    resolve(root, 'apps/protocol-api/jest.config.js'),
  ],
};

module.exports = config;
