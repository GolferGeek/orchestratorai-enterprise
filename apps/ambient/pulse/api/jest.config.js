/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: [
    // E2E tests require running services — run separately with npm run test:e2e
    '.*\\.e2e\\.spec\\.ts$',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        strictNullChecks: false,
        noImplicitAny: false,
      },
    }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  testTimeout: 120000,
  moduleNameMapper: {
    '^@orchestratorai/planes$': '<rootDir>/../../../../../packages/planes/index.ts',
    '^@orchestratorai/planes/(.*)$': '<rootDir>/../../../../../packages/planes/$1',
    '^@orchestratorai/auth-client$': '<rootDir>/../../../../../packages/auth-client/src/index.ts',
    '^@orchestratorai/auth-client/testing$': '<rootDir>/../../../../../packages/auth-client/src/testing.ts',
    '^@nestjs/common$': '<rootDir>/../../../../../node_modules/@nestjs/common',
    '^@nestjs/core$': '<rootDir>/../../../../../node_modules/@nestjs/core',
    '^jose$': '<rootDir>/__mocks__/jose.js',
    '^quick-lru$': '<rootDir>/__mocks__/quick-lru.js',
    '^@azure-rest/ai-inference$': '<rootDir>/__mocks__/@azure-rest/ai-inference.js',
    '^@azure/core-auth$': '<rootDir>/__mocks__/@azure/core-auth.js',
    '^@google-cloud/vertexai$': '<rootDir>/__mocks__/@google-cloud/vertexai.js',
    '^@google-cloud/storage$': '<rootDir>/__mocks__/@google-cloud/storage.js',
    '^@google-cloud/secret-manager$': '<rootDir>/__mocks__/@google-cloud/secret-manager.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@processing/(.*)$': '<rootDir>/processing/$1',
  },
};
