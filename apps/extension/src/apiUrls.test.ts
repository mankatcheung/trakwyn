import { describe, expect, it } from 'vitest';
import { API_URLS, resolveDefaultApiUrl } from './apiUrls';

describe('resolveDefaultApiUrl', () => {
  it('points a dev build at the local API', () => {
    expect(resolveDefaultApiUrl({ dev: true })).toBe(API_URLS.DEVELOPMENT);
  });

  it('points a production build at the production API', () => {
    expect(resolveDefaultApiUrl({ dev: false })).toBe(API_URLS.PRODUCTION);
  });

  it('lets a build-time override win in either mode', () => {
    const override = 'https://staging.example.com/graphql';

    expect(resolveDefaultApiUrl({ dev: true, override })).toBe(override);
    expect(resolveDefaultApiUrl({ dev: false, override })).toBe(override);
  });

  it.each([undefined, '', '   '])('ignores a blank override (%j)', (override) => {
    expect(resolveDefaultApiUrl({ dev: false, override })).toBe(API_URLS.PRODUCTION);
  });

  it('ships the production API as the default for store builds', () => {
    expect(API_URLS.PRODUCTION).toBe('https://api.trakwyn.com/graphql');
  });
});
