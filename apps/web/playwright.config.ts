import { defineConfig, devices } from '@playwright/test';

// Locally the specs run against the dev servers (reusing ones already up). CI
// serves the built output instead (JEF-487): no first-request compilation, and
// closer to what production runs. The e2e job builds both first (`pnpm
// --filter @trakwyn/api build`, and the web build with E2E_PLAIN_BUILD=1, which
// skips the Vercel-only nitro output that `vite preview` cannot serve).
const apiCommand = process.env.CI
  ? 'pnpm --filter @trakwyn/api start'
  : 'pnpm --filter @trakwyn/api dev';
const webCommand = process.env.CI
  ? 'pnpm --filter @trakwyn/web preview --port 3000 --strictPort'
  : 'pnpm --filter @trakwyn/web dev';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // One retry, not two (JEF-489): a test that needs a second one is hiding a
  // real fault. A retried pass is reported in the job summary (the `json`
  // reporter below feeds .github/scripts/flaky-summary.sh), not silently kept.
  retries: process.env.CI ? 1 : 0,
  // Locally one worker, so a failure is easy to read and the shared dev
  // server is not overloaded. CI runs two per shard (JEF-488): every test
  // registers its own account (`uniqueEmail`, and the fake OAuth provider
  // mints a fresh identity per sign-in) so no spec reads another's rows, and
  // the per-IP abuse limits that every test trips from localhost are lifted
  // outside production (RATE_LIMIT_RELAXED_MAX_ATTEMPTS). What stays shared is
  // the one API process and database per shard, so a new spec must not assert
  // on global state (totals over all users, a fixed email, a shared setting).
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: apiCommand,
      url: 'http://localhost:3001/graphql',
      reuseExistingServer: !process.env.CI,
      env: process.env.CI ? { ...process.env, STORAGE_PROVIDER: 'local' } : undefined,
      timeout: 30_000,
    },
    {
      command: webCommand,
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
