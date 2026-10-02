import { describe, expect, it } from 'vitest';
import { operationName, transportFailureProperties } from './transportFailure';

const TRACE_ID = 'a'.repeat(32);

describe('transportFailureProperties', () => {
  it('reports no response as a network error', () => {
    expect(transportFailureProperties(null, 'Me', TRACE_ID)).toEqual({
      network_error: true,
      operation: 'Me',
      trace_id: TRACE_ID,
    });
  });

  it.each([500, 502, 503])('reports a %i with its status', (status) => {
    expect(transportFailureProperties(status, 'Me', TRACE_ID)).toEqual({
      status,
      operation: 'Me',
      trace_id: TRACE_ID,
    });
  });

  it.each([200, 400, 401, 404, 429])('does not report a %i', (status) => {
    expect(transportFailureProperties(status, 'Me', TRACE_ID)).toBeNull();
  });
});

describe('operationName', () => {
  it('reads the declared name of a query or mutation', () => {
    expect(operationName('query Me { me { id } }')).toBe('Me');
    expect(operationName('\n  mutation LoginMobile($email: String!) { x }')).toBe('LoginMobile');
  });

  it('is `anonymous` for an unnamed operation', () => {
    expect(operationName('{ me { id } }')).toBe('anonymous');
  });
});
