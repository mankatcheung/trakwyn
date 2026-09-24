import { describe, expect, it } from 'vitest';
import { AXIOM_INGEST_ORIGIN, readServerLogConfig } from '#/server/observability/serverLogConfig';

const PRODUCTION = {
  NODE_ENV: 'production',
  AXIOM_WEB_TOKEN: 'xaat-ingest-only',
  AXIOM_WEB_DATASET: 'trakwyn-web',
};

describe('readServerLogConfig', () => {
  it('targets the dataset on the EU edge ingest endpoint in production', () => {
    expect(readServerLogConfig(PRODUCTION)).toEqual({
      ingestUrl: `${AXIOM_INGEST_ORIGIN}/v1/ingest/trakwyn-web`,
      token: 'xaat-ingest-only',
    });
  });

  it('is disabled outside production even with a token set', () => {
    expect(readServerLogConfig({ ...PRODUCTION, NODE_ENV: 'development' })).toBeNull();
    expect(readServerLogConfig({ ...PRODUCTION, NODE_ENV: 'test' })).toBeNull();
  });

  it('is disabled when the token or dataset is missing or blank', () => {
    expect(readServerLogConfig({ ...PRODUCTION, AXIOM_WEB_TOKEN: undefined })).toBeNull();
    expect(readServerLogConfig({ ...PRODUCTION, AXIOM_WEB_TOKEN: '  ' })).toBeNull();
    expect(readServerLogConfig({ ...PRODUCTION, AXIOM_WEB_DATASET: '' })).toBeNull();
  });

  it('never reads a VITE_-prefixed variable, which would reach the browser bundle', () => {
    expect(
      readServerLogConfig({
        NODE_ENV: 'production',
        VITE_AXIOM_WEB_TOKEN: 'xaat-leaked',
        VITE_AXIOM_WEB_DATASET: 'trakwyn-web',
      }),
    ).toBeNull();
  });

  it('encodes the dataset name into the path', () => {
    expect(readServerLogConfig({ ...PRODUCTION, AXIOM_WEB_DATASET: 'web/../api' })?.ingestUrl).toBe(
      `${AXIOM_INGEST_ORIGIN}/v1/ingest/web%2F..%2Fapi`,
    );
  });
});
