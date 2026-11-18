import type { CodegenConfig } from '@graphql-codegen/cli';
import { apiOrigin } from './devPorts';

// CODEGEN_SCHEMA is a path to an SDL file (`pnpm codegen:check` prints one with
// the API's `schema:print`, so CI needs no running API). Unset, the schema is
// read from the API at `apiOrigin`, as `pnpm codegen` always has.
export const schemaSource = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CODEGEN_SCHEMA?.trim() || `${apiOrigin}/graphql`;

const config: CodegenConfig = {
  schema: schemaSource(),
  documents: ['src/**/*.{ts,tsx,graphql}', '!src/graphql/generated/**', '!src/__tests__/**'],
  generates: {
    'src/graphql/generated/': {
      preset: 'client',
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
