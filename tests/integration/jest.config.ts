import type { Config } from 'jest';

const config: Config = {
  displayName: 'integration',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testMatch: ['<rootDir>/*.spec.ts'],
  // Run sequentially — tests depend on auth token from earlier suites
  maxWorkers: 1,
  // 30s per test — real HTTP calls need time
  testTimeout: 30000,
  setupFiles: ['<rootDir>/setup-env.ts'],
};

export default config;
