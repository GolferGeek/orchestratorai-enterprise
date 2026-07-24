import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: path.resolve(directory, 'tsconfig.json'),
      },
    ],
  },
  moduleNameMapper: {
    '^@/database$': path.resolve(
      directory,
      '../../packages/planes/database/index.ts',
    ),
    '^@/auth/(.*)$': path.resolve(
      directory,
      '../../packages/planes/auth/$1',
    ),
    '^@orchestratorai/planes$': path.resolve(
      directory,
      '../../packages/planes/index.ts',
    ),
    '^@orchestratorai/planes/(.*)$': path.resolve(
      directory,
      '../../packages/planes/$1',
    ),
    '^@orchestrator-ai/transport-types$': path.resolve(
      directory,
      '../../packages/transport-types/dist/cjs/index.js',
    ),
  },
  testTimeout: 120000,
};
