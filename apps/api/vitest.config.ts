import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#src/': resolve(import.meta.dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setupEnv.ts'],
    // Migrates one PGlite template per run; every test database is a clone.
    globalSetup: ['./src/__tests__/globalSetup.ts'],
    include: ['src/**/*.test.ts'],
    // Vitest defaults to 5s, which suits the unit tests — they finish in
    // milliseconds and are unaffected by a higher ceiling. It does not suit
    // the integration tests, which drive a real Fastify app over a real
    // database and deliberately-slow password hashing: registering two
    // users and walking an OAuth flow costs ~3-5s unloaded, and CI runs the
    // whole suite in parallel on a shared runner. They were passing on the
    // margin and failing whenever the runner was busy, which reads as
    // flakiness but is really a limit set for a suite this one outgrew.
    //
    // hookTimeout covers `buildTestApp()`: importing the whole app (~2s
    // unloaded) plus booting a PGlite clone (JEF-342). With the web suite
    // running alongside under turbo, 30s proved too tight for that on an
    // 8-core machine, so it is 60s — a ceiling, not a cost; hooks that finish
    // early are unaffected. Integration files no longer pass their own
    // `beforeAll(..., 30_000)`, so this one number is the limit everywhere.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/use-cases/**', 'src/interface-adapters/**', 'src/infrastructure/**'],
    },
  },
});
