import { describe, it, expect } from 'vitest';
import { parse } from 'graphql';
import {
  describeGraphQLOperation,
  formatGraphQLOperation,
} from '#src/infrastructure/observability/graphqlOperation.js';

describe('describeGraphQLOperation', () => {
  it('returns the type and name of a named operation', () => {
    expect(describeGraphQLOperation(parse('mutation register { __typename }'), undefined)).toEqual({
      type: 'mutation',
      name: 'register',
    });
  });

  it('returns the type alone for an anonymous operation', () => {
    expect(describeGraphQLOperation(parse('{ __typename }'), undefined)).toEqual({
      type: 'query',
      name: undefined,
    });
  });

  it('uses the operation the request selected when the document has several', () => {
    const document = parse('query first { __typename } mutation second { __typename }');

    expect(describeGraphQLOperation(document, 'second')).toEqual({
      type: 'mutation',
      name: 'second',
    });
  });

  it('returns null when the operation cannot be determined', () => {
    const document = parse('query first { __typename } query second { __typename }');

    expect(describeGraphQLOperation(document, undefined)).toBeNull();
    expect(describeGraphQLOperation(document, 'missing')).toBeNull();
  });
});

describe('formatGraphQLOperation', () => {
  it('joins type and name, and falls back to the type', () => {
    expect(formatGraphQLOperation({ type: 'mutation', name: 'register' })).toBe(
      'mutation register',
    );
    expect(formatGraphQLOperation({ type: 'query', name: undefined })).toBe('query');
  });
});
