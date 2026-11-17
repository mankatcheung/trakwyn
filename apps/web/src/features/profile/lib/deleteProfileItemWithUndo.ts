import type { QueryClient } from '@tanstack/react-query';
import { showUndoToast } from '#/lib/undoToast';

interface DeleteProfileItemOptions {
  qc: QueryClient;
  /** The section's query key. Its first element is also the field the list sits under (`['skills']` holds `{ skills }`). */
  queryKey: readonly string[];
  id: string;
  /** The GraphQL delete mutation. It takes `$id` and is sent once the undo window closes. */
  document: string;
  message: string;
}

type ProfileList = Record<string, ReadonlyArray<{ id: string }> | undefined>;

/**
 * Deletes one CV profile row (a skill, a language, a role and so on) with an
 * undo toast (JEF-625).
 *
 * The row leaves the cache at once, so the delete button cannot be clicked
 * twice, and the request is held by `showUndoToast` until the window closes
 * (and replayed after a refresh). The delete is a hard delete, so undo can only
 * mean "never send it".
 *
 * Undo puts back only this row, at its old position, instead of restoring a
 * snapshot of the whole list: with two deletes pending, undoing the first must
 * not bring back the second.
 */
export function deleteProfileItemWithUndo({
  qc,
  queryKey,
  id,
  document,
  message,
}: DeleteProfileItemOptions): void {
  const field = queryKey[0] ?? '';
  const list = qc.getQueryData<ProfileList>(queryKey)?.[field] ?? [];
  const index = list.findIndex((item) => item.id === id);
  const removed = index === -1 ? undefined : list[index];

  if (removed) {
    qc.setQueryData<ProfileList>(queryKey, (prev) => ({
      ...prev,
      [field]: (prev?.[field] ?? []).filter((item) => item.id !== id),
    }));
  }

  showUndoToast({
    message,
    operation: { document, variables: { id } },
    onUndo: () => {
      if (!removed) return;
      qc.setQueryData<ProfileList>(queryKey, (prev) => {
        const current = prev?.[field] ?? [];
        // A refetch may already have brought the row back.
        if (current.some((item) => item.id === id)) return prev;
        return {
          ...prev,
          [field]: [...current.slice(0, index), removed, ...current.slice(index)],
        };
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });
}
