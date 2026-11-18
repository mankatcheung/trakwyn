import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChangesGuard } from '#/hooks/useUnsavedChangesGuard';

const { useBlocker } = vi.hoisted(() => ({ useBlocker: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useBlocker }));

interface BlockerOptions {
  shouldBlockFn: () => boolean;
  disabled: boolean;
  enableBeforeUnload: boolean;
}
const lastOptions = () => useBlocker.mock.lastCall![0] as BlockerOptions;

describe('useUnsavedChangesGuard (JEF-577)', () => {
  beforeEach(() => useBlocker.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('is disabled, with no beforeunload prompt, while inactive', () => {
    renderHook(() => useUnsavedChangesGuard(false, 'Leave?'));
    expect(lastOptions()).toMatchObject({ disabled: true, enableBeforeUnload: false });
  });

  it('is enabled, with the beforeunload prompt, while active', () => {
    renderHook(() => useUnsavedChangesGuard(true, 'Leave?'));
    expect(lastOptions()).toMatchObject({ disabled: false, enableBeforeUnload: true });
  });

  it('blocks navigation when the user declines the confirm, and shows the message', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useUnsavedChangesGuard(true, 'Discard changes?'));
    expect(lastOptions().shouldBlockFn()).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
  });

  it('lets navigation through when the user accepts the confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderHook(() => useUnsavedChangesGuard(true, 'Leave?'));
    expect(lastOptions().shouldBlockFn()).toBe(false);
  });

  it('follows `active` when it flips', () => {
    const { rerender } = renderHook(({ on }) => useUnsavedChangesGuard(on, 'Leave?'), {
      initialProps: { on: true },
    });
    rerender({ on: false });
    expect(lastOptions()).toMatchObject({ disabled: true, enableBeforeUnload: false });
  });
});
