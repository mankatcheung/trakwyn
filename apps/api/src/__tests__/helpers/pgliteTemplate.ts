import { readFile } from 'node:fs/promises';
import { inject } from 'vitest';
import { createDb, type DbHandle } from '#src/infrastructure/db/createDb.js';

let template: Promise<Blob> | undefined;

/** The migrated snapshot `globalSetup.ts` wrote, read once per test file. */
function loadTemplate(): Promise<Blob> {
  template ??= readFile(inject('pgliteTemplatePath')).then((bytes) => new Blob([bytes]));
  return template;
}

/**
 * A new, isolated in-memory PGlite database that already has every real
 * migration applied — a clone of the template built once per run.
 */
export async function createMigratedPglite(): Promise<DbHandle> {
  return createDb('pglite:memory', { pgliteSnapshot: await loadTemplate() });
}
