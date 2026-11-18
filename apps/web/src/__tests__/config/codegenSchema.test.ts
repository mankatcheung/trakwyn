import { describe, expect, it } from 'vitest';
import { schemaSource } from '../../../codegen.ts';
import { apiOrigin } from '../../../devPorts.ts';

describe('codegen schema source', () => {
  it('reads the running API when CODEGEN_SCHEMA is unset', () => {
    expect(schemaSource({})).toBe(`${apiOrigin}/graphql`);
  });

  it('reads the SDL file named by CODEGEN_SCHEMA', () => {
    expect(schemaSource({ CODEGEN_SCHEMA: '/tmp/schema.graphql' })).toBe('/tmp/schema.graphql');
  });

  it('treats an empty or blank CODEGEN_SCHEMA as unset', () => {
    expect(schemaSource({ CODEGEN_SCHEMA: '' })).toBe(`${apiOrigin}/graphql`);
    expect(schemaSource({ CODEGEN_SCHEMA: '  ' })).toBe(`${apiOrigin}/graphql`);
  });
});
