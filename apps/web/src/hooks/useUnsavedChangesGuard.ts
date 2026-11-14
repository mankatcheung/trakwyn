import { useBlocker } from '@tanstack/react-router';

/**
 * Asks before the page is left while `active` (JEF-577): the browser's own
 * prompt for closing the tab or reloading, and `confirmMessage` for in-app
 * navigation, including the back button. Idle when `active` is false, so a
 * saved document leaves without a question.
 */
export function useUnsavedChangesGuard(active: boolean, confirmMessage: string): void {
  useBlocker({
    shouldBlockFn: () => !window.confirm(confirmMessage),
    disabled: !active,
    enableBeforeUnload: active,
  });
}
