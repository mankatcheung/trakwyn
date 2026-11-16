import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import { reactCompiler } from './reactCompiler';

export default defineConfig({
  plugins: [viteReact(), reactCompiler()],
  resolve: {
    alias: {
      '#/': resolve(import.meta.dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
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
