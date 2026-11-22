import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import { reactCompiler } from './reactCompiler';
import { apiOrigin, plansApiOrigin } from './devPorts';

export default defineConfig({
  plugins: [viteReact(), reactCompiler()],
  resolve: {
    alias: {
      '#/': resolve(import.meta.dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
    // Two tiers (JEF-665), each a Vitest project that inherits this file's plugins
    // and aliases; `--project unit|integration` selects one and `pnpm test` runs
    // `unit` only. tierAssignment.test.ts fails on a test file no project claims,
    // or two do.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          // Pinned rather than left to apps/web/.env (gitignored, developer-local):
          // whether relative OAuth hrefs assert correctly must not depend on
          // whether that file happens to hold the dev-proxy form (`/graphql`) or
          // an absolute one (`http://localhost:3001/graphql`) — both are valid
          // local configs, but only the relative one makes those assertions pass.
          // Tests that need the absolute (production-subdomain) shape stub this
          // explicitly with `vi.stubEnv` + `vi.resetModules()`.
          env: { VITE_API_URL: '/graphql' },
          setupFiles: ['./src/__tests__/setup.ts'],
          // The jest-axe sweeps in a11y.test.tsx take 5-7s under full-suite
          // parallelism, right on Vitest's 5s default — they timed out only when
          // enough other files were running alongside them, which reads as a random
          // failure rather than a slow test. Matches the API package's timeout.
          testTimeout: 20_000,
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/node_modules/**', 'src/__integration__/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          // Not jsdom: its `location` cannot be observed or replaced, and this
          // tier has to see the redirect `endSession` makes. support/browserShim.ts
          // supplies the few browser globals the client reads.
          environment: 'node',
          env: { VITE_API_URL: `${apiOrigin}/graphql` },
          globalSetup: ['./src/__integration__/globalSetup.ts'],
          setupFiles: ['./src/__integration__/setupAfterEnv.ts'],
          // The first request after boot compiles on demand under tsx.
          testTimeout: 60_000,
          hookTimeout: 120_000,
          include: ['src/__integration__/**/*.test.ts', 'src/__integration__/**/*.test.tsx'],
          exclude: ['**/node_modules/**', 'src/__integration__/plans/**'],
        },
      },
      {
        // The same tier against an API booted with `PLANS_ENFORCED=true`, which
        // `EntitlementService` reads once at boot and the other suites cannot
        // share: they write Pro features as a new (Free) user (JEF-667).
        extends: true,
        test: {
          name: 'integration-plans',
          environment: 'node',
          env: { VITE_API_URL: `${plansApiOrigin}/graphql` },
          globalSetup: ['./src/__integration__/globalSetupPlans.ts'],
          setupFiles: ['./src/__integration__/setupAfterEnv.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          include: ['src/__integration__/plans/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'src/graphql/generated/**',
        'src/routeTree.gen.ts',
        'src/router.tsx',
        'src/routes/__root.tsx',
        'src/routes/index.tsx',
        'src/lib/queryClient.ts',
      ],
    },
  },
});
