// @aya/infra extends the monorepo's shared flat ESLint config.
// The SST config relies on ambient globals ($config, $app, sst) declared in the
// generated .sst/platform types, so they are registered as readonly globals and
// the generated .sst tree is ignored.
import aya from '../../eslint.config.mjs';

export default [
  ...aya,
  { ignores: ['.sst/**'] },
  {
    languageOptions: {
      globals: {
        $config: 'readonly',
        $app: 'readonly',
        $dev: 'readonly',
        sst: 'readonly',
      },
    },
    rules: {
      // SST requires the triple-slash reference to its generated platform types
      // at the top of sst.config.ts; it cannot be expressed as an import.
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
];
