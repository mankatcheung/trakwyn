import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCooldown } from '#/hooks/useCooldown';

describe('useCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at zero seconds', () => {
    const { result } = renderHook(() => useCooldown());
    expect(result.current[0]).toBe(0);
  });

  it('counts down once a second after start', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBe(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current[0]).toBe(0);
  });

  it('stops ticking at zero and never goes negative', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current[1](1));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0]).toBe(0);
  });

  it('has no timer running while idle', () => {
    renderHook(() => useCooldown());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts from the new duration', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current[1](10));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current[1](30));
    expect(result.current[0]).toBe(30);
  });

  it('clears its timer on unmount', () => {
    const { result, unmount } = renderHook(() => useCooldown());
    act(() => result.current[1](10));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
