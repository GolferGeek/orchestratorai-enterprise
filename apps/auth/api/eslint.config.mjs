// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsconfigPath = path.join(__dirname, 'tsconfig.eslint.json');
const scriptsTsconfigPath = path.join(__dirname, 'tsconfig.scripts.json');
const testFilePatterns = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  'test/**/*.ts',
];

const temporaryTypeSafetyAllowlist = {
  // All rules now enabled - this allowlist is now empty
  // Previously disabled rules that are now enforced:
  // - '@typescript-eslint/await-thenable' ✅
  // - '@typescript-eslint/require-await' ✅
  // - '@typescript-eslint/no-redundant-type-constituents' ✅
  // - '@typescript-eslint/no-explicit-any' ✅
  // - '@typescript-eslint/no-unsafe-argument' ✅
  // - '@typescript-eslint/no-unsafe-assignment' ✅
  // - '@typescript-eslint/no-unsafe-member-access' ✅
  // - '@typescript-eslint/no-unsafe-call' ✅
  // - '@typescript-eslint/no-unsafe-return' ✅
  // - '@typescript-eslint/no-floating-promises' ✅
  // - '@typescript-eslint/restrict-template-expressions' ✅
  // - '@typescript-eslint/no-misused-promises' ✅
  // - '@typescript-eslint/unbound-method' ✅
};

const allowlistedTypeSafetyRules = Object.fromEntries(
  Object.entries(temporaryTypeSafetyAllowlist).map(([rule, config]) => [
    rule,
    config.level,
  ]),
);

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'eslint.config.mjs',
      'src/__mocks__/**',
      'scripts/**',
      '**/scripts/**',
      'testing/**',
      'testing/test/**',
      '**/testing/**',
    ],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
  },
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.d.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProjectForFiles: [
            '**/scripts/**/*.ts',
            '**/scripts/**/*.d.ts',
          ],
        },
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintPluginPrettierRecommended,
    ],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...allowlistedTypeSafetyRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: testFilePatterns,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // Relax rules for test files - tests often need more flexibility
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      'src/llms/**',
      'src/langchain/**',
      'src/supabase/utils/langchain-client.ts',
      'src/auth/auth.module.ts',
      'src/planes/auth/**',
      'test/**',
      'testing/**',
      '**/testing/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'openai',
              message:
                'Use the centralized LLM service/client instead of importing provider SDKs directly.',
            },
            {
              name: '@langchain/openai',
              message:
                'Use centralized LLM client. Provider-specific LangChain wrappers only in approved modules.',
            },
            {
              name: '@langchain/anthropic',
              message:
                'Use centralized LLM client. Provider-specific LangChain wrappers only in approved modules.',
            },
            {
              name: '@anthropic-ai/sdk',
              message:
                'Use the centralized LLM service/client instead of importing provider SDKs directly.',
            },
          ],
          patterns: [
            {
              group: ['**/providers/*', '**/sdk/*'],
              message:
                'Provider SDKs must only be used in central LLM modules.',
            },
          ],
        },
      ],
    },
  },
);
