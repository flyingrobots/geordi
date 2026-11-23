import { fileURLToPath } from 'node:url';

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

// A Set or Map constructed while a loop is running: the loop body, a for/while/do-while
// condition, or a for update. The for initialiser and the for...of / for...in subject run
// once, so they are not matched. Each position is matched twice: as the allocation itself
// (`while (new Set())`, `for (;; new Map())`) and as any descendant of it, which also covers
// callbacks and nested loops.
const LOOP_COLLECTION_ALLOCATION = 'NewExpression[callee.name=/^(Set|Map)$/]';
const LOOP_COLLECTION_ALLOCATION_SELECTOR = [
  ':matches(ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement) > .body',
  ':matches(ForStatement, WhileStatement, DoWhileStatement) > .test',
  'ForStatement > .update',
]
  .flatMap((position) => [
    `${position}:matches(${LOOP_COLLECTION_ALLOCATION})`,
    `${position} :matches(${LOOP_COLLECTION_ALLOCATION})`,
  ])
  .join(', ');

const restrictedSyntax = [
  {
    selector: 'TSAnyKeyword',
    message: 'Do not use any. Model the value or decode it at a boundary.',
  },
  {
    selector: 'TSUnknownKeyword',
    message: 'Do not use unknown in domain code. Decode boundary input into explicit types.',
  },
  {
    selector:
      "NewExpression[callee.name='Error'], NewExpression[callee.name='TypeError'], NewExpression[callee.name='RangeError'], NewExpression[callee.name='SyntaxError'], NewExpression[callee.name='ReferenceError']",
    message: 'Do not construct built-in error types directly. Throw a named project-specific Error subclass.',
  },
  {
    selector: LOOP_COLLECTION_ALLOCATION_SELECTOR,
    message:
      'Do not allocate a Set or Map inside a loop. Hoist the allocation above the loop and clear or reuse it, or add a local disable comment that says why a fresh collection per iteration is required.',
  },
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
    message: 'Use the JsonPort boundary instead of direct JSON.parse.',
  },
  {
    selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
    message: 'Use the JsonPort boundary instead of direct JSON.stringify.',
  },
];

const restrictedSyntaxWithoutJsonCalls = restrictedSyntax.filter(
  (restriction) =>
    !String(restriction.selector).startsWith("CallExpression[callee.object.name='JSON']"),
);

const unusedVars = [
  'error',
  {
    argsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
  },
];

export default [
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      // Cargo build output, including the base trees the contract gate extracts there.
      '**/target/**',
      '**/.turbo/**',
      '**/.obsidian/**',
      '**/.trash/**',
    ],
  },
  ...tsPlugin.configs['flat/strict-type-checked'],
  ...tsPlugin.configs['flat/stylistic-type-checked'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': unusedVars,
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNever: true,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    files: ['packages/core/src/ports/json.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntaxWithoutJsonCalls],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      ...tsPlugin.configs['flat/disable-type-checked'].rules,
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-unused-vars': unusedVars,
    },
  },
  prettier,
];
