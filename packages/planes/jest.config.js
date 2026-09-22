/**
 * Jest configuration for packages/planes tests.
 *
 * Uses platform API's node_modules for NestJS, ts-jest, and other dependencies.
 * Maps @/ aliases to the planes package root (packages/planes/).
 * Maps @orchestrator-ai/transport-types to the local source.
 */
const path = require('path');
const platformApi = path.resolve(__dirname, '../../apps/api');
const planesRoot = __dirname;
const transportTypes = path.resolve(__dirname, '../../packages/transport-types');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: planesRoot,
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: `${planesRoot}/tsconfig.test.json`,
    }],
    // uuid v14 ships ESM only. Without a JS transform every suite that reaches
    // run-metadata.service (and therefore llm-generation.service) dies on
    // "Unexpected token 'export'" before a single test runs.
    '^.+\\.js$': ['ts-jest', {
      tsconfig: `${planesRoot}/tsconfig.test.json`,
      diagnostics: false,
    }],
  },
  // Everything in node_modules is left alone except the ESM-only packages we
  // actually import from source.
  transformIgnorePatterns: ['/node_modules/(?!(uuid)/)'],
  modulePaths: [
    `${platformApi}/node_modules`,
  ],
  moduleNameMapper: {
    // Planes self-referential imports
    '^@orchestratorai/planes$': `${planesRoot}/index.ts`,
    '^@orchestratorai/planes/(.*)$': `${planesRoot}/$1`,
    // @/ maps to planes root (planes is its own package)
    '^@/database$': `${planesRoot}/database/index.ts`,
    '^@/database/(.*)$': `${planesRoot}/database/$1`,
    '^@/config/(.*)$': `${planesRoot}/config/$1`,
    '^@/config$': `${planesRoot}/config/index.ts`,
    '^@/planes/database/supabase-client.service$': `${planesRoot}/database/supabase-client.service.ts`,
    '^@/utils/(.*)$': `${planesRoot}/utils/$1`,
    '^@/(.*)$': `${planesRoot}/$1`,
    // Transport types (ESM package — map to CJS dist)
    '^@orchestrator-ai/transport-types$': `${transportTypes}/dist/cjs/index.js`,
    '^@orchestrator-ai/transport-types/(.*)$': `${transportTypes}/dist/cjs/$1`,
  },
  testTimeout: 120000,
};
