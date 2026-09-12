import { resolve } from 'node:path';
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  validate,
  type IntrospectionQuery,
  type GraphQLSchema,
} from 'graphql';
import { extractFromDirectory } from '../__tests__/support/extractGraphqlDocuments';
import { API_BASE_URL } from './support/apiProcess';

/**
 * Closes JEF-300's G-3: apps/mobile hand-writes every GraphQL document it
 * sends and nothing checks them against the API. Rename a field in a resolver
 * and mobile still compiles, still passes all 347 Jest suites, and fails at
 * runtime on a user's phone.
 *
 * This validates each document against the schema of the API this tier just
 * booted — the same schema apps/web generates its types from — so drift fails
 * here instead of in someone's hands.
 */

const PACKAGE_ROOT = resolve(__dirname, '../..');

describe('mobile GraphQL documents', () => {
  const { documents, unresolved } = extractFromDirectory(PACKAGE_ROOT, ['src', 'app']);
  let schema: GraphQLSchema;

  beforeAll(async () => {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    });
    const body = (await response.json()) as { data: IntrospectionQuery };
    schema = buildClientSchema(body.data);
  });

  it('has documents to validate', () => {
    // Without this, an extractor that quietly matched nothing would leave the
    // suite below green while checking not one document.
    expect(documents.length).toBeGreaterThan(50);
    expect(unresolved).toEqual([]);
  });

  it('validates every document against the live API schema', () => {
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
