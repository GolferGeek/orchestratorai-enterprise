/**
 * Jest configuration for packages/planes tests.
 *
 * Uses Compose API's node_modules for NestJS, ts-jest, and other dependencies.
 * Maps @/ aliases to the planes package root (packages/planes/).
 * Maps @orchestrator-ai/transport-types to the local source.
 */
const path = require('path');
const composeApi = path.resolve(__dirname, '../../apps/compose/api');
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
  },
  modulePaths: [
    `${composeApi}/node_modules`,
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
    // ESM packages that need to be mocked
    '^jose$': `${composeApi}/src/__mocks__/jose.js`,
    '^quick-lru$': `${composeApi}/src/__mocks__/quick-lru.js`,
    '^@azure-rest/ai-inference$': `${composeApi}/src/__mocks__/@azure-rest/ai-inference.js`,
    // @azure/core-auth is a real CJS package at root node_modules — no mock needed
    '^@google-cloud/vertexai$': `${composeApi}/src/__mocks__/@google-cloud/vertexai.js`,
    '^@google-cloud/storage$': `${composeApi}/src/__mocks__/@google-cloud/storage.js`,
    '^@google-cloud/secret-manager$': `${composeApi}/src/__mocks__/@google-cloud/secret-manager.js`,
  },
  testTimeout: 120000,
};
