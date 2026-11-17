import type { CodegenConfig } from '@graphql-codegen/cli';
import { apiOrigin } from './devPorts';

const config: CodegenConfig = {
  schema: `${apiOrigin}/graphql`,
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
