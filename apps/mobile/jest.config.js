// Four test tiers (JEF-300), separated by Jest projects rather than by moving
// files — every existing suite already sits where its tier expects it:
//
//   unit         pure logic, no renderer and no network      *.test.ts
//   component    a screen or hook rendered through RNTL      *.test.tsx
//   integration  real GraphQL documents over a real
//                transport to a real API                    src/__integration__
//
// The .ts / .tsx split is not cosmetic: a suite that renders anything needs
// JSX and one that does not never has it, so the extension already records
// which side of the seam a suite sits on. That is why this split renames
// nothing — it only draws a boundary around what was already true.
//
// src/__tests__/architecture/tierAssignment.test.ts fails the build if a test
// file lands somewhere no project claims. Without it, the first suite written
// off-convention would simply stop running in CI, silently and green.
//
// The e2e tier is the one that is not a Jest project at all: it drives a real
// build on a device, so it lives in .maestro/ and runs through `test:e2e`.

const base = {
  preset: 'jest-expo',
  // Shared teardown — see the file for what leaks without it.
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupAfterEnv.ts'],
};

// testPathIgnorePatterns entries are regular expressions matched against the
// full path, not globs — integration suites are .test.ts too, so the unit
// project has to exclude them by location.
const INTEGRATION_DIR = '<rootDir>/src/__integration__/';

module.exports = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', INTEGRATION_DIR],
    },
    {
      ...base,
      displayName: 'component',
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.test.tsx',
        '<rootDir>/app/**/__tests__/**/*.test.tsx',
      ],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: [`${INTEGRATION_DIR}**/*.test.ts?(x)`],
      // Boots apps/api against a throwaway SQLite file and tears it down
      // afterwards; the suites themselves assume a server is already up.
      globalSetup: '<rootDir>/src/__integration__/globalSetup.ts',
      globalTeardown: '<rootDir>/src/__integration__/globalTeardown.ts',
      // React Native's environment plus Node's own fetch — see the file for why
      // the preset's fetch cannot make a real request.
      testEnvironment: '<rootDir>/src/__integration__/nodeFetchEnvironment.js',
      // testTimeout and maxWorkers are whole-run options rather than
      // per-project ones, so this tier raises its own timeout from inside
      // (jest.setTimeout, in the file below) and gets its serial execution from
      // the `test:integration` script's --runInBand.
      setupFilesAfterEnv: [
        ...base.setupFilesAfterEnv,
        '<rootDir>/src/__integration__/setupAfterEnv.ts',
      ],
    },
  ],

  testTimeout: 20_000,

  // A failing suite in CI is otherwise only visible by scrolling the job log.
  // The github-actions reporter turns each failure into an inline annotation
  // on the run, which is the mobile equivalent of the report the Playwright
  // job uploads.
  reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],

  // Coverage is aggregated across whichever projects the run selected, which
  // is why it is configured once here rather than per project.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.tsx',
    '!**/__tests__/**',
    '!src/__integration__/**',
    '!**/*.d.ts',
  ],
  coverageReporters: ['text', 'html', 'lcov'],
};
