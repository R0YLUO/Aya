// @aya/web ESLint config.
//
// Extends the monorepo's shared flat config, then adds a hard architectural
// boundary: the web client must NEVER import server-only packages (@aya/api or
// @aya/llm) or persistence code. It depends only on @aya/shared and the HTTP API
// (North Star: Extensible — LLM/persistence details stay out of clients).
import aya from '../../eslint.config.mjs';

export default [
  ...aya,
  {
    // Next.js generates next-env.d.ts (a triple-slash reference file) on build;
    // it is not ours to lint.
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aya/api', '@aya/api/*', '@aya/llm', '@aya/llm/*'],
              message:
                'The web client must not import @aya/api or @aya/llm. Talk to the backend over the HTTP API and use @aya/shared types only.',
            },
          ],
        },
      ],
    },
  },
];
