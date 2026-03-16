import eslint from '@eslint/js';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsconfigPath = path.join(__dirname, 'tsconfig.eslint.json');

const browserGlobals = {
  ...globals.browser,
  ...globals.es2021,
};

const sharedTypeScriptRules = {
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/no-empty-object-type': 'warn',
  '@typescript-eslint/no-duplicate-enum-values': 'warn',
  '@typescript-eslint/no-unused-expressions': 'warn',
  '@typescript-eslint/ban-ts-comment': 'warn',
  'prefer-const': 'warn',
  'no-prototype-builtins': 'warn',
};

const vueFlatRecommended = pluginVue.configs['flat/recommended'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.output/**',
      'coverage/**',
      'ios/**',
      'android/**',
      '**/*.vue?*', // Ignore Vue virtual files that may have parsing issues
    ],
  },
  ...vueFlatRecommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      globals: browserGlobals,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: sharedTypeScriptRules,
  },
  {
    files: ['**/*.vue'],
    extends: [
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
      globals: browserGlobals,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      vue: pluginVue,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...sharedTypeScriptRules,
      // Turn off all Vue style rules so we can focus on API backend
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/attributes-order': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/no-deprecated-slot-attribute': 'off',
      'vue/no-unused-vars': 'warn',
      'vue/no-mutating-props': 'warn',
      'vue/no-ref-as-operand': 'warn',
      'vue/require-default-prop': 'warn',
      'vue/no-dupe-v-else-if': 'warn',
      'vue/no-parsing-error': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'tests/**/*.vue', '**/*.spec.ts', '**/*.spec.tsx', '**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...browserGlobals,
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
    files: ['tests/e2e/support/commands.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
