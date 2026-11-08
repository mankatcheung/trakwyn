#!/usr/bin/env tsx
/**
 * Database seed script — populates a Postgres (Neon, or local PGlite) database with
 * demo data so preview environments have something useful to explore.
 *
 * Usage:
 *   DATABASE_URL=pglite:./.pglite pnpm db:seed      (or any postgres:// URL)
 *
 * Safe to run multiple times — it deletes any existing demo user (cascading to
 * all related rows) before inserting fresh data, so re-seeding is clean.
 *
 * Opens its own handle and closes it when done, as `migrate.ts` does: left
 * open, a PGlite handle keeps the process alive after the last insert.
 */
import 'dotenv/config';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from '#src/infrastructure/db/createDb.js';
import { runSeed } from './seed/index.js';

const databaseUrl = process.env[ENV.DATABASE_URL];

if (!databaseUrl) {
  console.error(`${ENV.DATABASE_URL} is required`);
  process.exit(1);
}

// SEED_NOW (an ISO instant) pins the dates the seed is relative to (JEF-532).
const seedNow = process.env[ENV.SEED_NOW];
const now = seedNow ? new Date(seedNow) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`${ENV.SEED_NOW} must be an ISO date, got "${seedNow}"`);
  process.exit(1);
}

const { db, close } = await createDb(databaseUrl);
try {
  await runSeed(db, now);
} finally {
  await close();
}
