// Loads the env file a test run uses, before any test file runs, so a test that
// genuinely needs a real env var (as opposed to createTestDb()'s self-contained
// in-memory PGlite, which most tests use and don't need this for) doesn't
// silently see `undefined`. A setupFiles entry, not a plain import in
// vitest.config.ts, because it needs to run inside each test worker's own
// process/context — config-file-level code runs in a separate parent
// process whose `process.env` mutations don't propagate to workers.
//
// `.env.test` when it exists, `.env` otherwise (JEF-656). `.env` is the dev
// server's file (PLANS_ENFORCED=true, BILLING_PROVIDER=polar, an absolute
// API_ORIGIN) and makes seven integration tests fail that pass in CI, which
// has no env file at all. `.env.test` is a copy of the committed
// `.env.test.example`, which holds only what CI's test job holds, so the two
// run the same. dotenv never overwrites a variable that is already set, so an
// exported variable still wins over either file.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const API_ROOT = resolve(import.meta.dirname, '..', '..');
const testEnv = resolve(API_ROOT, '.env.test');

config({ path: existsSync(testEnv) ? testEnv : resolve(API_ROOT, '.env'), quiet: true });
