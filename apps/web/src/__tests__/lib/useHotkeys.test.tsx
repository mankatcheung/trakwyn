import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useHotkeys } from '#/hooks/useHotkeys';

afterEach(() => vi.restoreAllMocks());

describe('useHotkeys', () => {
  it('calls the handler when the combo matches', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys({ key: 'k', shift: true }, handler));
    fireEvent.keyDown(window, { key: 'k', shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys and a disabled hook', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(({ on }) => useHotkeys({ key: 'k' }, handler, on), {
      initialProps: { on: true },
    });
    fireEvent.keyDown(window, { key: 'j' });
    expect(handler).not.toHaveBeenCalled();
    rerender({ on: false });
    fireEvent.keyDown(window, { key: 'k' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('registers the listener once and calls the latest handler', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ h }) => useHotkeys({ key: 'k' }, h), {
      initialProps: { h: first },
    });
    rerender({ h: second });
    rerender({ h: second });
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'k' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
  });
});
