// ESLint config for @aya/mobile.
//
// Extends the shared monorepo config and adds the dependency-direction guard
// from CLAUDE.md: clients depend only on @aya/shared + the HTTP API and must
// NEVER import the backend (@aya/api) or LLM (@aya/llm) packages.
import aya from '../../eslint.config.mjs';

export default [
  ...aya,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aya/api', '@aya/api/*', '@aya/llm', '@aya/llm/*'],
              message:
                'Mobile must not import @aya/api or @aya/llm. Clients depend only on @aya/shared and the HTTP API (CLAUDE.md dependency rules).',
            },
          ],
        },
      ],
    },
  },
  {
    // Test/support files use node:test and node-only APIs.
    files: ['src/**/*.test.ts', 'src/test-support/**/*.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
  },
];
