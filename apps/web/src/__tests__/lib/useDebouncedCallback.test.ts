import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebouncedCallback } from '#/hooks/useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls through once, with the last arguments, after the delay', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 1000));

    result.current('a');
    result.current('b');
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('flush runs the pending call immediately, and only once', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 1000));

    result.current('pending');
    result.current.flush();
    expect(fn).toHaveBeenCalledWith('pending');

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('flush is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 1000));

    result.current.flush();
    result.current('x');
    vi.advanceTimersByTime(1000);
    result.current.flush();

    expect(fn).toHaveBeenCalledOnce();
  });

  it('drops the pending call on unmount', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 1000));

    result.current('x');
    unmount();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });
});
