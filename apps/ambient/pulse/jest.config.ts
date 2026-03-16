import type { Config } from 'jest';
import { resolve } from 'path';

/**
 * Root Jest configuration for the agent-communication monorepo.
 *
 * Uses Jest's projects array to collect unit test configs from each app and package.
 * Paths are resolved to absolute so that per-project tsconfig references (like
 * tsconfig.spec.json) are resolved relative to each project directory, not the root.
 *
 * Run from the agent-communication root with: npm run test:unit
 *
 * E2E tests are run per-app using their respective jest-e2e.json configs.
 */
const root = resolve(__dirname);

const config: Config = {
  projects: [
    resolve(root, 'packages/shared-protocols/jest.config.js'),
    resolve(root, 'packages/shared-types/jest.config.js'),
    resolve(root, 'apps/sunstream-app/jest.config.js'),
    resolve(root, 'apps/ascentek-app/jest.config.js'),
    resolve(root, 'apps/protocol-api/jest.config.js'),
  ],
};

export default config;
