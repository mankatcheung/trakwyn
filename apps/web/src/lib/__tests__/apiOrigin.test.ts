import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadOrigin(): Promise<string> {
  vi.resetModules();
  return (await import('../apiOrigin')).API_ORIGIN;
}

describe('API_ORIGIN', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is empty when VITE_API_URL is unset, so dev links stay relative', async () => {
    vi.stubEnv('VITE_API_URL', undefined as unknown as string);
    expect(await loadOrigin()).toBe('');
  });

  it('is empty for the dev-proxy-relative /graphql', async () => {
    vi.stubEnv('VITE_API_URL', '/graphql');
    expect(await loadOrigin()).toBe('');
  });

  it('strips /graphql from an absolute production URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.trakwyn.com/graphql');
    expect(await loadOrigin()).toBe('https://api.trakwyn.com');
  });

  it('leaves a URL without a /graphql suffix untouched', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    expect(await loadOrigin()).toBe('https://api.example.com');
  });
});
