import { describe, expect, it } from 'vitest';
import { readServerLogConfig } from '#/server/observability/serverLogConfig';

const PRODUCTION = {
  NODE_ENV: 'production',
  VITE_POSTHOG_KEY: 'phc_public',
  VITE_POSTHOG_HOST: 'https://eu.i.posthog.com',
};

describe('readServerLogConfig', () => {
  it("targets the host's capture endpoint with the project key in production", () => {
    expect(readServerLogConfig(PRODUCTION)).toEqual({
      captureUrl: 'https://eu.i.posthog.com/i/v0/e/',
      apiKey: 'phc_public',
    });
  });

  it('falls back to the EU ingestion host when none is set', () => {
    expect(readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_HOST: undefined })?.captureUrl).toBe(
      'https://eu.i.posthog.com/i/v0/e/',
    );
    expect(readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_HOST: ' ' })?.captureUrl).toBe(
      'https://eu.i.posthog.com/i/v0/e/',
    );
  });

  it('keeps a host with a trailing slash to one slash', () => {
    expect(
      readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_HOST: 'https://ph.example.com/' })
        ?.captureUrl,
    ).toBe('https://ph.example.com/i/v0/e/');
  });

  it('is disabled outside production even with a key set', () => {
    expect(readServerLogConfig({ ...PRODUCTION, NODE_ENV: 'development' })).toBeNull();
    expect(readServerLogConfig({ ...PRODUCTION, NODE_ENV: 'test' })).toBeNull();
  });

  it('is disabled when the key is missing or blank', () => {
    expect(readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_KEY: undefined })).toBeNull();
    expect(readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_KEY: '  ' })).toBeNull();
  });

  it('is disabled, rather than throwing, when the host is malformed', () => {
    expect(readServerLogConfig({ ...PRODUCTION, VITE_POSTHOG_HOST: 'not a url' })).toBeNull();
  });

  it('no longer reads the Axiom variables', () => {
    expect(
      readServerLogConfig({
        NODE_ENV: 'production',
        AXIOM_WEB_TOKEN: 'xaat-ingest-only',
        AXIOM_WEB_DATASET: 'trakwyn-web',
      }),
    ).toBeNull();
  });
});
