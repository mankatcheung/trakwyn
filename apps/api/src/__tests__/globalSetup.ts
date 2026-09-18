import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { TestProject } from 'vitest/node';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';
import type { DrizzleDb } from '#src/infrastructure/db/client.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Snapshot of a PGlite database with every real migration applied. */
    pgliteTemplatePath: string;
  }
}

/**
 * Builds the migrated PGlite template once per `vitest run` (JEF-342).
 *
 * Every test database is a clone of it (`helpers/pgliteTemplate.ts`). A fresh
 * PGlite runs `initdb` and then the migrations — about 1.2s each, and far
 * more when a busy CI runner is doing it for every test file at once, which
 * is what pushed the integration suites' `beforeAll` past its timeout.
 * Booting from the snapshot skips both. It is still the real migrations,
 * applied through the production `applyMigrations`, just applied once.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const client = new PGlite();
  await applyMigrations(drizzle({ client }) as unknown as DrizzleDb);
  const snapshot = await client.dumpDataDir('none');
  await client.close();

  const path = join(tmpdir(), `trakwyn-pglite-template-${randomUUID()}.tar`);
  await writeFile(path, Buffer.from(await snapshot.arrayBuffer()));
  project.provide('pgliteTemplatePath', path);

  return async () => {
    await rm(path, { force: true });
  };
}
