import { defineConfig, devices } from '@playwright/test';

// Guide scripts (JEF-532): content/guides/en/<slug>/guide.ts walks one guide's
// steps and takes its screenshots. Run through `pnpm guides:verify` (steps only)
// or `pnpm guides:capture` (also rewrites images that changed): both seed the
// demo account first, see e2e/guides/run.sh.
//
// The servers mirror playwright.config.ts: dev servers locally, the built
// output in CI. Locally nothing is reused: a `pnpm dev` API would hold the
// PGlite database the seed just wrote to (stop it first) and may enforce plans.
// The fake LLM provider and local storage keep the output the same every run.
const apiCommand = process.env.CI
  ? 'pnpm --filter @trakwyn/api start'
  : 'pnpm --filter @trakwyn/api dev';
const webCommand = process.env.CI
  ? 'pnpm --filter @trakwyn/web preview --port 3000 --strictPort'
  : 'pnpm --filter @trakwyn/web dev';

export default defineConfig({
  testDir: '../../content/guides',
  testMatch: '**/guide.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results/guides',
  use: {
    baseURL: 'http://localhost:3000',
    // 1280 x 800 at 1.25x is the 1600 x 1000 the guide images are.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.25,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1.25 } }],
  webServer: [
    {
      command: apiCommand,
      url: 'http://localhost:3001/graphql',
      reuseExistingServer: false,
      env: {
        ...process.env,
        // Plans must not be enforced, or the AI helper shows its locked state.
        PLANS_ENFORCED: 'false',
        LLM_PROVIDER_MODE: 'fake',
        STORAGE_PROVIDER: 'local',
      } as Record<string, string>,
      timeout: 60_000,
    },
    {
      command: webCommand,
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
