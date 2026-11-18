import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '#/hooks/useMediaQuery';

type Listener = (event: MediaQueryListEvent) => void;

function stubMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return state[query] ?? false;
    },
    media: query,
    addEventListener: (_type: string, fn: Listener) => {
      listeners.set(query, (listeners.get(query) ?? new Set()).add(fn));
    },
    removeEventListener: (_type: string, fn: Listener) => {
      listeners.get(query)?.delete(fn);
    },
  })) as unknown as typeof window.matchMedia;
  return {
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
    change(query: string, matches: boolean) {
      state[query] = matches;
      listeners.get(query)?.forEach((fn) => fn({ matches } as MediaQueryListEvent));
    },
  };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('starts from the live match', () => {
    stubMatchMedia({ '(min-width: 768px)': true });
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('is false when the query does not match', () => {
    stubMatchMedia({});
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('follows change events', () => {
    const media = stubMatchMedia({ '(min-width: 768px)': false });
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    act(() => media.change('(min-width: 768px)', true));
    expect(result.current).toBe(true);
    act(() => media.change('(min-width: 768px)', false));
    expect(result.current).toBe(false);
  });

  it('re-reads when the query changes and drops the old listener', () => {
    const media = stubMatchMedia({ a: false, b: true });
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: 'a' },
    });
    expect(result.current).toBe(false);
    rerender({ q: 'b' });
    expect(result.current).toBe(true);
    expect(media.listenerCount('a')).toBe(0);
    expect(media.listenerCount('b')).toBe(1);
  });

  it('removes its listener on unmount', () => {
    const media = stubMatchMedia({ a: false });
    const { unmount } = renderHook(() => useMediaQuery('a'));
    expect(media.listenerCount('a')).toBe(1);
    unmount();
    expect(media.listenerCount('a')).toBe(0);
  });
});
