module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/',
  ],
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testTimeout: 120000,
  moduleNameMapper: {
    '^@orchestratorai/auth-client$': '<rootDir>/../../../../packages/auth-client/src/index.ts',
    '^@orchestratorai/auth-client/(.*)$': '<rootDir>/../../../../packages/auth-client/src/$1',
    '^@orchestratorai/planes$': '<rootDir>/../../../../packages/planes/index.ts',
    '^@orchestratorai/planes/(.*)$': '<rootDir>/../../../../packages/planes/$1',
    '^jose$': '<rootDir>/__mocks__/jose.js',
    '^quick-lru$': '<rootDir>/__mocks__/quick-lru.js',
    '^@azure-rest/ai-inference$': '<rootDir>/__mocks__/@azure-rest/ai-inference.js',
    '^@azure/core-auth$': '<rootDir>/__mocks__/@azure/core-auth.js',
    '^@google-cloud/vertexai$': '<rootDir>/__mocks__/@google-cloud/vertexai.js',
    '^@google-cloud/storage$': '<rootDir>/__mocks__/@google-cloud/storage.js',
    '^@google-cloud/secret-manager$': '<rootDir>/__mocks__/@google-cloud/secret-manager.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@agents/(.*)$': '<rootDir>/agents/$1',
    '^@agents/base/(.*)$': '<rootDir>/agents/base/$1',
    '^@agents/base/sub-services/(.*)$': '<rootDir>/agents/base/sub-services/$1',
    '^@agents/base/implementations/(.*)$': '<rootDir>/agents/base/implementations/$1',
    '^@agent-pool/(.*)$': '<rootDir>/agent-pool/$1',
    '^@llm/(.*)$': '<rootDir>/llms/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@agent-platform/(.*)$': '<rootDir>/agent-platform/$1',
    '^@agent2agent/(.*)$': '<rootDir>/agent2agent/$1'
  }
};
