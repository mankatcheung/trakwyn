import { describe, it, expect } from 'vitest';
import {
  redactDocumentToken,
  REDACTED,
} from '#src/infrastructure/observability/redactDocumentToken.js';

describe('redactDocumentToken', () => {
  it('blanks the token of a document file link', () => {
    expect(redactDocumentToken('/documents/doc-1/file?token=1790000000.abc_DEF-123')).toBe(
      `/documents/doc-1/file?token=${REDACTED}`,
    );
  });

  it('blanks it wherever it sits among other parameters, and only its value', () => {
    expect(redactDocumentToken('/x?a=1&token=secret&b=2#frag')).toBe(
      `/x?a=1&token=${REDACTED}&b=2#frag`,
    );
  });

  it('blanks every occurrence', () => {
    expect(redactDocumentToken('/x?token=one&token=two')).toBe(
      `/x?token=${REDACTED}&token=${REDACTED}`,
    );
  });

  it.each([
    ['no query', '/graphql'],
    ['another parameter', '/auth/oauth/google/start?platform=extension'],
    ['a parameter that only ends in token', '/x?csrftoken=abc'],
    ['a path that only mentions token', '/token=abc'],
  ])('leaves a URL with %s alone', (_label, url) => {
    expect(redactDocumentToken(url)).toBe(url);
  });
});
