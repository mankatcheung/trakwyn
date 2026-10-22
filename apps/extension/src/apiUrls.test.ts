import { describe, expect, it } from 'vitest';
import { API_URLS, resolveDefaultApiUrl } from './apiUrls';

describe('resolveDefaultApiUrl', () => {
  it('points a dev build at the local API', () => {
    expect(resolveDefaultApiUrl({ dev: true })).toBe(API_URLS.DEVELOPMENT);
  });

  it('gives a non-dev build with no override no URL rather than a default', () => {
    expect(resolveDefaultApiUrl({ dev: false })).toBe('');
  });

  it('lets a build-time override win in either mode', () => {
    const override = 'https://staging.example.com/graphql';

    expect(resolveDefaultApiUrl({ dev: true, override })).toBe(override);
    expect(resolveDefaultApiUrl({ dev: false, override })).toBe(override);
  });

  it.each([undefined, '', '   '])('treats a blank override as unset (%j)', (override) => {
    expect(resolveDefaultApiUrl({ dev: false, override })).toBe('');
    expect(resolveDefaultApiUrl({ dev: true, override })).toBe(API_URLS.DEVELOPMENT);
  });
});
