/** What the editor tells the user about their work (JEF-577). */
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface SaveFlags {
  /** An edit is on screen that no save has been asked for yet (it is waiting out the debounce). */
  dirty: boolean;
  /** A content save is on the wire or queued. */
  saving: boolean;
  /** The last content save failed and nothing has saved since. */
  failed: boolean;
}

/**
 * One label from the three flags. A save in flight wins over everything, since
 * its result is about to replace the others; fresh typing wins over an old
 * failure, because the next save will report on that text too.
 */
export function deriveSaveState({ dirty, saving, failed }: SaveFlags): SaveState {
  if (saving) return 'saving';
  if (dirty) return 'dirty';
  if (failed) return 'error';
  return 'saved';
}

/** Leaving now would lose or abandon work: the page must warn. */
export function hasUnsavedWork(state: SaveState): boolean {
  return state !== 'saved';
}

/** What the status line needs to draw one state. */
export interface SaveStatus {
  state: SaveState;
  /** The API's own message for a failure, shown beside the generic label. */
  errorMessage?: string | null;
  onRetry: () => void;
}
