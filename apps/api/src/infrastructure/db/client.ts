import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from './createDb.js';

export type { DrizzleDb, DrizzleTransaction, DrizzleClient } from './createDb.js';

const databaseUrl = process.env[ENV.DATABASE_URL];
if (!databaseUrl) {
  throw new Error(`${ENV.DATABASE_URL} is not set`);
}

// The process-wide database. Postgres enforces foreign keys unconditionally,
// so the `PRAGMA foreign_keys = ON` the libSQL client needed is gone — every
// `ON DELETE CASCADE` in the schema is live on every connection.
export const { db, close: closeDb } = await createDb(databaseUrl);
