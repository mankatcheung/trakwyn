import { describe, expect, it } from 'vitest';
import { extractGqlError, extractGqlErrorCode } from '#/features/settings/lib/gqlErrors';

const withErrors = (errors: unknown) => ({ response: { errors } });

describe('extractGqlError', () => {
  it('returns the first error message', () => {
    expect(extractGqlError(withErrors([{ message: 'first' }, { message: 'second' }]))).toBe(
      'first',
    );
  });

  it.each([
    ['a plain Error', new Error('x')],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
    ['a response with no errors', { response: {} }],
    ['an empty errors list', withErrors([])],
    ['an error with no message', withErrors([{ extensions: { code: 'X' } }])],
    ['an undefined response', { response: undefined }],
  ])('returns null for %s', (_name, input) => {
    expect(extractGqlError(input)).toBeNull();
  });
});

describe('extractGqlErrorCode (JEF-44)', () => {
  it('returns the first error extensions.code', () => {
    expect(
      extractGqlErrorCode(withErrors([{ extensions: { code: 'STEP_UP_REQUIRED' } }, {}])),
    ).toBe('STEP_UP_REQUIRED');
  });

  it.each([
    ['a plain Error', new Error('x')],
    ['null', null],
    ['a response with no errors', { response: {} }],
    ['an error with no extensions', withErrors([{ message: 'm' }])],
    ['extensions with no code', withErrors([{ extensions: {} }])],
  ])('returns null for %s', (_name, input) => {
    expect(extractGqlErrorCode(input)).toBeNull();
  });
});
