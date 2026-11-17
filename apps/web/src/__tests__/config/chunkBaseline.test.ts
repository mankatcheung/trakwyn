import { describe, expect, it } from 'vitest';
import {
  chunkName,
  compareChunks,
  pickRouteChunks,
  routeChunkName,
  type ChunkBaseline,
} from '../../../scripts/lib/chunks.ts';

const baseline: ChunkBaseline = {
  recordedWith: 'test',
  routeChunks: [
    { name: 'analytics', bytes: 1000 },
    { name: 'analytics', bytes: 5000 },
    { name: 'dashboard', bytes: 2000 },
  ],
};

describe('chunkName', () => {
  it('strips the content hash', () => {
    expect(chunkName('dashboard-BlMUdjic.js')).toBe('dashboard');
    expect(chunkName('_applicationId-BwbKShtr.js')).toBe('_applicationId');
  });

  it('ignores files that are not hashed scripts', () => {
    expect(chunkName('board-DgxjQ5AM.webp')).toBeNull();
    expect(chunkName('main.js')).toBeNull();
  });
});

describe('routeChunkName', () => {
  it.each([
    ['src/routes/_authenticated/dashboard.tsx', 'dashboard'],
    ['src/routes/_authenticated/applications/$applicationId.tsx', '_applicationId'],
  ])('names the chunk of %s', (file, expected) => {
    expect(routeChunkName(file)).toBe(expected);
  });

  it.each([
    'src/routes/index.tsx',
    'src/routes/_authenticated/settings/-components/shared.ts',
    'src/routes/_authenticated/settings/CLAUDE.md',
    'src/routes/sitemap[.]xml.ts',
  ])('has no chunk name for %s', (file) => {
    expect(routeChunkName(file)).toBeNull();
  });
});

describe('compareChunks', () => {
  it('passes when every route chunk is still there', () => {
    const built = [
      { name: 'analytics', bytes: 1000 },
      { name: 'analytics', bytes: 5000 },
      { name: 'dashboard', bytes: 2100 },
      { name: 'new-route', bytes: 10 },
    ];

    expect(compareChunks(baseline, built)).toEqual({ missing: [], grown: [] });
  });

  it('fails when a route lost its own chunk', () => {
    const built = [
      { name: 'analytics', bytes: 1000 },
      { name: 'analytics', bytes: 5000 },
    ];

    expect(compareChunks(baseline, built).missing).toEqual(['dashboard']);
  });

  it('fails when one of two same-named chunks is gone', () => {
    const built = [
      { name: 'analytics', bytes: 1000 },
      { name: 'dashboard', bytes: 2000 },
    ];

    expect(compareChunks(baseline, built).missing).toEqual(['analytics']);
  });

  it('only mentions a chunk that grew past the tolerance', () => {
    const built = [
      { name: 'analytics', bytes: 1000 },
      { name: 'analytics', bytes: 5000 },
      { name: 'dashboard', bytes: 4000 },
    ];

    expect(compareChunks(baseline, built)).toEqual({
      missing: [],
      grown: [{ name: 'dashboard', before: 2000, after: 4000 }],
    });
  });
});

describe('pickRouteChunks', () => {
  it('keeps only chunks named after a route, sorted', () => {
    const built = [
      { name: 'Button', bytes: 5 },
      { name: 'dashboard', bytes: 2 },
      { name: 'analytics', bytes: 9 },
    ];

    expect(pickRouteChunks(built, new Set(['dashboard', 'analytics']))).toEqual([
      { name: 'analytics', bytes: 9 },
      { name: 'dashboard', bytes: 2 },
    ]);
  });
});
