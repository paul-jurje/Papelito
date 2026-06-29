// Root ESLint configuration.
// Each app has its own `eslint.config.mjs`; at the workspace root we only
// lint a tiny placeholder file so `pnpm lint` can report success without
// duplicating app-level rules.
export default [
  {
    files: ['eslint-root-ok.js'],
  },
];
