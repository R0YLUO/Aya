// Shared flat ESLint config for the Aya monorepo.
// Packages extend it: `import aya from '../../eslint.config.mjs'; export default aya;`
// (optionally spreading additional package-specific entries afterwards).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Never lint build output or deps.
    ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Surface unused code, but allow intentional `_`-prefixed args/vars.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Encourage explicit typing at module boundaries without being noisy internally.
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Keep ESLint out of formatting's lane — Prettier owns layout.
  prettier,
);
