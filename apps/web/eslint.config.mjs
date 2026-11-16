import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import prettierConfig from 'eslint-config-prettier';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.output/**',
      'node_modules/**',
      'src/graphql/generated/**',
      'src/routeTree.gen.ts',
      '.vercel/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  prettierConfig,
  betterTailwindcss.configs.recommended,
  {
    // Validates class strings against the real Tailwind v4 stylesheet
    // (src/styles.css) so correctness rules like no-unknown-classes and
    // no-conflicting-classes resolve actual utilities instead of guessing.
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/styles.css',
      },
    },
    rules: {
      // Prettier owns line layout: it reflows JSX attributes around multi-line
      // string values, so this rule's wrapped output never reaches a stable
      // state with `pnpm format:check` (the two oscillate). Everything the
      // rule would enforce inside a class string is order-independent anyway;
      // revisit only if prettier-plugin-tailwindcss ever replaces Prettier.
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      // A class Tailwind has renamed or dropped (v3 `rounded` is `rounded-sm`
      // in v4) is a regression the moment it lands, so it fails lint (JEF-615).
      'better-tailwindcss/no-deprecated-classes': 'error',
      // Component classes hand-written in styles.css as plain CSS (not
      // @utility, so the Tailwind compiler can't see them) — route/page
      // transitions, sidebar entrance animations, theme toggle.
      'better-tailwindcss/no-unknown-classes': [
        'error',
        {
          ignore: [
            '^route-transition$',
            '^theme-toggle-icon$',
            '^sidebar-nav-item$',
            '^sidebar-entrance-item$',
            '^sidebar-desktop-entrance$',
          ],
        },
      ],
    },
  },
  {
    // `recommended` carries rules-of-hooks, exhaustive-deps and the React
    // Compiler rules (JEF-610): code that breaks them is what the compiler
    // skips or miscompiles, so they are errors, not hints.
    plugins: { 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      // The compiler does not skip a component for this one; it is a style
      // rule. 15 existing effects set state on mount (hydration, media
      // queries, storage reads). A warning keeps them visible without a
      // refactor in the enablement PR (JEF-610); new code should avoid it.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // JEF-615: a call to an API its library marks `@deprecated` is an error.
    // TypeScript and the editor show the strike-through but `tsc` and the
    // build stay silent, so deprecations piled up unseen (TanStack Query's
    // `ensureQueryData`, React's `FormEvent`, zod's `.email()`, recharts'
    // `Cell`). The rule reads type information, so this block is the one
    // that makes `pnpm lint` type-aware; tsconfig.json includes every file.
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    // JEF-82: flags hardcoded JSX text that should go through useLocale()'s
    // t() instead. `warn`, not `error` — only the nav/auth/settings/landing
    // surfaces are translated so far (phase 1); the rest of the app still
    // has untranslated copy by design, to be swept up in later phases. This
    // is deliberately the *detection* mechanism for that follow-up work, not
    // just a regression guard — see JEF-82 for the phase plan.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'warn',
        {
          mode: 'jsx-text-only',
          message: "Wrap user-facing text in useLocale()'s t() instead of a literal string.",
        },
      ],
    },
  },
);
