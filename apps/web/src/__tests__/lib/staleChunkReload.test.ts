import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStaleChunkGuard,
  isStaleChunkError,
  reloadForStaleChunk,
  watchForStaleChunks,
} from '#/lib/staleChunkReload';

function stubLocation(reload: () => void) {
  Object.defineProperty(window, 'location', {
    value: { reload },
    writable: true,
    configurable: true,
  });
}

describe('isStaleChunkError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://www.trakwyn.com/assets/applications-BajBnjMF.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('matches %s', (message) => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it('ignores unrelated errors and non-errors', () => {
    expect(isStaleChunkError(new Error('render blew up'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    stubLocation(reload);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reloads once, then leaves the error to surface', () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after the guard is cleared', () => {
    reloadForStaleChunk();
    clearStaleChunkGuard();
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('watchForStaleChunks', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    reload.mockReset();
    stubLocation(reload);
  });

  afterEach(() => vi.useRealTimers());

  it('reloads on vite:preloadError and stops after cleanup', () => {
    const stop = watchForStaleChunks();
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    stop();
    sessionStorage.clear();
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('resets the guard once the page has stayed up', () => {
    const stop = watchForStaleChunks();
    window.dispatchEvent(new Event('vite:preloadError'));
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(2);
    stop();
  });
});
