/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        declaration: false,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        typeRoots: ['../../../../node_modules/@types'],
        types: ['node', 'jest'],
      },
    }],
  },
  testMatch: ['**/*.spec.ts'],
};
