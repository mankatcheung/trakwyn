import { describe, expectTypeOf, it } from 'vitest';
import type { Resolved } from '#/graphql/resolved';

interface Row {
  __typename?: 'Row';
  id?: string | null;
  note?: string | null;
  count?: number | null;
}

describe('Resolved', () => {
  it('makes every selected field non-null and required, and drops __typename', () => {
    expectTypeOf<Resolved<Row>>().toEqualTypeOf<{ id: string; note: string; count: number }>();
  });

  it('keeps the named keys as T | null, never undefined', () => {
    expectTypeOf<Resolved<Row, 'note'>>().toEqualTypeOf<{
      id: string;
      note: string | null;
      count: number;
    }>();
  });
});
