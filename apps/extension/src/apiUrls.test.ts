import { describe, expect, it } from 'vitest';
import { API_URLS, WEB_URLS, resolveDefaultApiUrl, resolveDefaultWebUrl } from './apiUrls';

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

describe('resolveDefaultWebUrl', () => {
  it('points a dev build at the local web app', () => {
    expect(resolveDefaultWebUrl({ dev: true })).toBe(WEB_URLS.DEVELOPMENT);
  });

  it('gives a non-dev build with no override no URL rather than a default', () => {
    expect(resolveDefaultWebUrl({ dev: false })).toBe('');
  });

  it('lets a build-time override win in either mode', () => {
    const override = 'https://www.example.com';

    expect(resolveDefaultWebUrl({ dev: true, override })).toBe(override);
    expect(resolveDefaultWebUrl({ dev: false, override })).toBe(override);
  });

  it('drops trailing slashes so a path can be appended', () => {
    expect(resolveDefaultWebUrl({ dev: false, override: ' https://www.example.com// ' })).toBe(
      'https://www.example.com',
    );
  });

  it.each([undefined, '', '   '])('treats a blank override as unset (%j)', (override) => {
    expect(resolveDefaultWebUrl({ dev: false, override })).toBe('');
    expect(resolveDefaultWebUrl({ dev: true, override })).toBe(WEB_URLS.DEVELOPMENT);
  });
});
