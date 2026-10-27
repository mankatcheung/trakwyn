import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSchema, parse, validate, type GraphQLSchema } from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractFromDirectory } from './support/extractGraphqlDocuments';

/**
 * Fails when the API's schema stops matching the documents the Clipper sends
 * (JEF-417). A store release cannot be rolled back, only replaced, and an
 * installed copy stays on its version for days or weeks, so a field renamed or
 * removed in the API breaks real users until a reviewed update lands. This
 * catches it in CI instead.
 *
 * The schema comes from `pnpm schema:print`, which builds the API's Pothos
 * schema directly: no database, no port, no API to boot. The `*Mobile`
 * mutations are the extension's contract with the API (`apps/api/CLAUDE.md`).
 */

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const SCHEMA_PRINT_TIMEOUT_MS = 60_000;

describe('extension GraphQL documents', () => {
  const { documents, unresolved } = extractFromDirectory(PACKAGE_ROOT, ['src']);
  let schema: GraphQLSchema;

  beforeAll(() => {
    const sdl = execFileSync('pnpm', ['--silent', '--filter', '@trakwyn/api', 'schema:print'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: SCHEMA_PRINT_TIMEOUT_MS,
    });
    schema = buildSchema(sdl);
  }, SCHEMA_PRINT_TIMEOUT_MS);

  it('has documents to validate', () => {
    // Without this, an extractor that quietly matched nothing would leave the
    // suite below green while checking not one document.
    expect(documents.length).toBeGreaterThanOrEqual(6);
    expect(unresolved).toEqual([]);
  });

  it('validates every document against the API schema', () => {
    const failures = documents.flatMap((document) => {
      let errors;
      try {
        errors = validate(schema, parse(document.text));
      } catch (error) {
        // A syntax error throws rather than being returned as a validation
        // error, and is just as much a broken document.
        return [`${document.file}:${document.line} ${document.name}: ${String(error)}`];
      }
      return errors.map(
        (error) => `${document.file}:${document.line} ${document.name}: ${error.message}`,
      );
    });

    expect(failures).toEqual([]);
  });
});
