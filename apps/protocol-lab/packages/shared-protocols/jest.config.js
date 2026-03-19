const { resolve } = require('path');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: resolve(__dirname, 'tsconfig.spec.json') }],
  },
  testMatch: ['**/*.spec.ts'],
};
