import { printSchema } from 'graphql';
import { schema } from './index.js';

/**
 * Prints the GraphQL schema as SDL on stdout (`pnpm schema:print`).
 *
 * Building the schema touches no database, port or environment variable, so a
 * client's test can read the API's contract without booting the API. The
 * extension's `graphqlDocuments.test.ts` validates its documents this way
 * (JEF-417).
 */
process.stdout.write(printSchema(schema));
