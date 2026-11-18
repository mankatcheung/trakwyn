import type { QueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { showUndoableActionToast } from '#/lib/undoToast';
import { BULK_RESTORE_APPLICATIONS, RESTORE_APPLICATION } from '../graphql/trashQueries';
import { DELETE_APPLICATION } from '../graphql/applicationMutations';

/**
 * Deleting an application is a soft delete (JEF-187), so undo is a real
 * `restoreApplication` call rather than a cancelled timer. That lets the
 * request go out immediately — the UI never waits on an undo window, and a
 * refresh mid-window cannot drop the delete, because there is no pending work
 * held in memory to drop.
 *
 * Deliberately plain functions taking a `QueryClient` rather than
 * `useMutation`: the detail page navigates away the moment it fires these, so
 * the component that started the work is gone before it finishes. `gqlClient`,
 * the QueryClient and `toast` all outlive it; a mutation observer does not.
 */

/** Everything an application touches lives under this prefix, Trash included. */
const invalidateApplications = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: ['applications'] });

async function restore(qc: QueryClient, ids: string[]): Promise<void> {
  try {
    if (ids.length === 1) await gqlClient.request(RESTORE_APPLICATION, { id: ids[0] });
    else await gqlClient.request(BULK_RESTORE_APPLICATIONS, { ids });
    await invalidateApplications(qc);
    for (const id of ids) qc.invalidateQueries({ queryKey: ['application', id] });
    toast.success(i18next.t('trash.restoredToast'));
  } catch (error) {
    toast.error(getErrorMessage(error));
  }
}

/**
 * Deletes one application now and offers Undo. `onDeleted` runs synchronously
 * before the request resolves — the caller uses it to leave the page or drop
 * the row, which is the whole point of not deferring.
 */
export function deleteApplicationWithUndo(
  qc: QueryClient,
  id: string,
  message: string,
  onDeleted?: () => void,
): void {
  void (async () => {
    try {
      await gqlClient.request(DELETE_APPLICATION, { id });
      await invalidateApplications(qc);
    } catch (error) {
      toast.error(getErrorMessage(error));
      await invalidateApplications(qc);
    }
  })();

  onDeleted?.();

  showUndoableActionToast({ message, onUndo: () => void restore(qc, [id]) });
}

/**
 * The list page's bulk delete. The caller has already removed the rows from
 * its cache optimistically and passes `onUndo` to put its snapshot back, so
 * the list settles at once in both directions while the server catches up.
 */
export function deleteApplicationsWithUndo(
  qc: QueryClient,
  ids: string[],
  message: string,
  onUndoOptimistic?: () => void,
): void {
  void (async () => {
    try {
      await Promise.all(ids.map((id) => gqlClient.request(DELETE_APPLICATION, { id })));
      await invalidateApplications(qc);
    } catch (error) {
      toast.error(getErrorMessage(error));
      await invalidateApplications(qc);
    }
  })();

  showUndoableActionToast({
    message,
    onUndo: () => {
      onUndoOptimistic?.();
      void restore(qc, ids);
    },
  });
}
