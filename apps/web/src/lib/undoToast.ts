import { toast } from 'sonner';
import i18next from 'i18next';
import { print, type DocumentNode } from 'graphql';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { forgetPendingOperation, rememberPendingOperation } from '#/lib/pendingOperations';

type UndoToastOptions = {
  message: string;
  duration?: number;
  /**
   * The request to send once the window closes. Taken as data rather than a
   * callback so it can be written to storage and replayed after a refresh —
   * an opaque `onExecute` could not survive the page. A typed document
   * (`graphql()`) is accepted too; it is printed to text first, because that is
   * what is stored and replayed.
   */
  operation: { document: string | DocumentNode; variables?: Record<string, unknown> };
  onUndo: () => void;
  /** Cache work once the request resolves, either way (usually invalidation). */
  onSettled?: () => void;
};

type UndoableActionToastOptions = {
  message: string;
  duration?: number;
  onUndo: () => void;
};

/**
 * Defers an irreversible operation until the undo window closes.
 *
 * Only for operations the server cannot reverse — deleting a note, a contact,
 * an interview round, a document. For those, "undo" can only mean "never send
 * it", so the request has to wait. Where a real reversing operation exists,
 * use `showUndoableActionToast` and send immediately (JEF-190).
 *
 * The operation is recorded durably before the timer starts, so a refresh or a
 * closed tab inside the window no longer drops it — the next load replays it
 * (JEF-191). The record is cleared on undo and once the request resolves.
 */
export function showUndoToast({
  message,
  duration = 5000,
  operation,
  onUndo,
  onSettled,
}: UndoToastOptions) {
  const document =
    typeof operation.document === 'string' ? operation.document : print(operation.document);
  const pendingId = rememberPendingOperation(document, operation.variables);

  const timer = setTimeout(() => {
    void (async () => {
      try {
        await gqlClient.request(document, operation.variables);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        forgetPendingOperation(pendingId);
        onSettled?.();
      }
    })();
  }, duration);

  toast(message, {
    duration,
    action: {
      label: i18next.t('common.undo'),
      onClick: () => {
        clearTimeout(timer);
        forgetPendingOperation(pendingId);
        onUndo();
      },
    },
  });
}

/**
 * Offers to reverse an operation that has **already happened**.
 *
 * Nothing is deferred: the caller performs the operation up front, so the UI
 * can settle immediately, and `onUndo` issues a real compensating request
 * (restore, re-create) rather than cancelling a timer.
 *
 * Because no pending work is held in memory, closing the tab cannot lose it,
 * and the undo window is a courtesy rather than a deadline — an application
 * missed here is still recoverable from Trash for thirty days.
 */
export function showUndoableActionToast({
  message,
  duration = 5000,
  onUndo,
}: UndoableActionToastOptions) {
  toast(message, {
    duration,
    action: { label: i18next.t('common.undo'), onClick: onUndo },
  });
}
