import { defineConfig, devices } from '@playwright/test';

// Marketing screenshots (JEF-528). A separate config with its own testDir keeps
// the capture out of the e2e run (`playwright.config.ts` only reads ./e2e).
// Never reuses a running server: one from `pnpm dev` would hold the PGlite
// database the seed just wrote to (stop it first) and may enforce plans.
// Run it through `pnpm --filter @trakwyn/web screenshots`, which seeds first.
export default defineConfig({
  testDir: './screenshots',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @trakwyn/api dev',
      url: 'http://localhost:3001/graphql',
      // Plans must not be enforced, or analytics shows the locked preview.
      env: { ...process.env, PLANS_ENFORCED: 'false' } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @trakwyn/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
