import { buildClientSchema, getIntrospectionQuery, parse, validate } from 'graphql';
import type { GraphQLSchema, IntrospectionQuery } from 'graphql';
import { REFRESH_MUTATION } from '#/graphql/client';
import { API_GRAPHQL_URL } from './support/apiProcess';

/**
 * `pnpm codegen:check` validates every typed `graphql()` document, but not the
 * plain strings it cannot see. `REFRESH_MUTATION` is the one the repo allows
 * (`webStructure.test.ts` fails on any other), and it is the call that keeps a
 * session alive: rename `refreshToken` in the API and web still builds, still
 * passes every unit suite, and signs everyone out an access-token lifetime later.
 */
const RAW_DOCUMENTS: Record<string, string> = { REFRESH_MUTATION };

describe('raw GraphQL documents', () => {
  let schema: GraphQLSchema;

  beforeAll(async () => {
    const response = await fetch(API_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    });
    const body = (await response.json()) as { data: IntrospectionQuery };
    schema = buildClientSchema(body.data);
  });

  it.each(Object.entries(RAW_DOCUMENTS))('%s is valid against the live schema', (_name, text) => {
    expect(validate(schema, parse(text)).map((error) => error.message)).toEqual([]);
  });

  it('fails a document that names a mutation the API does not have', () => {
    // Proves the check above can fail, so a green run means something.
    const errors = validate(schema, parse('mutation { refreshTokenRenamed }'));
    expect(errors.map((error) => error.message)).not.toEqual([]);
  });
});
