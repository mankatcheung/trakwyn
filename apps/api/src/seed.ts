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
 */
import 'dotenv/config';
import { runSeed } from './seed/index.js';

await runSeed();
