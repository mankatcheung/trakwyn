import { describe, expect, it } from 'vitest';
import { safeReturnTo, sameOriginPath } from '#/lib/returnTo';

describe('sameOriginPath (JEF-460)', () => {
  it('keeps a rooted path with its query string', () => {
    expect(sameOriginPath('/applications/abc/documents/cover-letters/new')).toBe(
      '/applications/abc/documents/cover-letters/new',
    );
    expect(sameOriginPath('/applications/abc?section=resumes')).toBe(
      '/applications/abc?section=resumes',
    );
  });

  it('has no fallback: nothing, or anything that is not a string, is null', () => {
    expect(sameOriginPath(undefined)).toBeNull();
    expect(sameOriginPath('')).toBeNull();
    expect(sameOriginPath(42)).toBeNull();
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'evil.example',
  ])('refuses the off-site value %j', (value) => {
    expect(sameOriginPath(value)).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it('defaults to the dashboard when nothing was captured', () => {
    expect(safeReturnTo(undefined)).toBe('/dashboard');
    expect(safeReturnTo(null)).toBe('/dashboard');
    expect(safeReturnTo('')).toBe('/dashboard');
  });

  it('keeps same-origin paths, including their query strings', () => {
    expect(safeReturnTo('/applications')).toBe('/applications');
    expect(safeReturnTo('/applications/abc123?tab=notes')).toBe('/applications/abc123?tab=notes');
  });

  it('discards protocol-relative and absolute URLs', () => {
    // A returnTo that leaves the site would make post-login navigation an
    // open redirect.
    expect(safeReturnTo('//evil.example')).toBe('/dashboard');
    expect(safeReturnTo('https://evil.example/phish')).toBe('/dashboard');
  });

  it('never sends an authenticated user back into an auth entry page', () => {
    // /login would re-trigger the logged-in guard and loop; /register is a
    // dead end once signed in.
    expect(safeReturnTo('/login')).toBe('/dashboard');
    expect(safeReturnTo('/register')).toBe('/dashboard');
  });
});
