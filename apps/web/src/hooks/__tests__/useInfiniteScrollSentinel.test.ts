import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInfiniteScrollSentinel } from '#/hooks/useInfiniteScrollSentinel';

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this);
  }
}

let originalIntersectionObserver: typeof IntersectionObserver;

describe('useInfiniteScrollSentinel', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    originalIntersectionObserver = window.IntersectionObserver;
    window.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it('does not create an observer when disabled', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, false));

    result.current(document.createElement('div'));

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('observes the given node when enabled', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, true));
    const node = document.createElement('div');

    result.current(node);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].observe).toHaveBeenCalledWith(node);
  });

  it('calls onIntersect when the sentinel intersects', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, true));

    result.current(document.createElement('div'));
    FakeIntersectionObserver.instances[0].trigger(true);

    expect(onIntersect).toHaveBeenCalledOnce();
  });

  it('does not call onIntersect when the entry is not intersecting', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, true));

    result.current(document.createElement('div'));
    FakeIntersectionObserver.instances[0].trigger(false);

    expect(onIntersect).not.toHaveBeenCalled();
  });

  it('disconnects the previous observer when the node changes', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, true));

    result.current(document.createElement('div'));
    const first = FakeIntersectionObserver.instances[0];
    result.current(document.createElement('div'));

    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
  });

  it('disconnects and does not re-observe when the node is set to null', () => {
    const onIntersect = vi.fn();
    const { result } = renderHook(() => useInfiniteScrollSentinel(onIntersect, true));

    result.current(document.createElement('div'));
    const first = FakeIntersectionObserver.instances[0];
    result.current(null);

    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it('always calls the latest onIntersect callback', () => {
    const onIntersectA = vi.fn();
    const onIntersectB = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useInfiniteScrollSentinel(cb, true),
      { initialProps: { cb: onIntersectA } },
    );

    result.current(document.createElement('div'));
    rerender({ cb: onIntersectB });
    FakeIntersectionObserver.instances[0].trigger(true);

    expect(onIntersectA).not.toHaveBeenCalled();
    expect(onIntersectB).toHaveBeenCalledOnce();
  });
});
