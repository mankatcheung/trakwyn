import { useCallback, useRef, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { useUpdateDocumentDraftContent } from './useUpdateDocumentDraftContent';

export interface DraftSavePayload {
  contentJson: string;
  plainText: string;
  aiInstructions?: string;
}

export interface DraftSaver {
  /** Queues a save behind any in flight; resolves to whether it was saved. */
  save: (payload: DraftSavePayload) => Promise<boolean>;
  /** Saves the payload that last failed again, if one did. */
  retry: () => Promise<boolean>;
  saving: boolean;
  /** The message of the last failed save, until something saves or the user edits again. */
  error: string | null;
  clearError: () => void;
  lastSavedAt: string | null;
  setLastSavedAt: (at: string | null) => void;
}

/**
 * Saves for the draft editor (JEF-508). Saves run one after another so an older
 * one can never land after a newer one, and the payload of a failed save is
 * kept so a failure after an AI result can be retried rather than lost.
 */
export function useDraftSaver(draftId: string | undefined): DraftSaver {
  const updateContent = useUpdateDocumentDraftContent();
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const failedRef = useRef<DraftSavePayload | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const save = useCallback(
    (payload: DraftSavePayload) => {
      if (!draftId) return Promise.resolve(false);
      setInFlight((n) => n + 1);
      const run = queueRef.current.then(() => updateContent.mutateAsync({ draftId, ...payload }));
      queueRef.current = run.catch(() => undefined);
      return run
        .then(
          (result) => {
            // A newer failure stays on screen: only the latest save speaks.
            failedRef.current = null;
            setError(null);
            setLastSavedAt(result.updatedAt);
            return true;
          },
          (err) => {
            failedRef.current = payload;
            setError(getErrorMessage(err));
            return false;
          },
        )
        .finally(() => setInFlight((n) => n - 1));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutateAsync is stable
    [draftId, updateContent.mutateAsync],
  );

  const retry = useCallback(async () => {
    const failed = failedRef.current;
    return failed ? save(failed) : true;
  }, [save]);

  const clearError = useCallback(() => {
    failedRef.current = null;
    setError(null);
  }, []);

  return { save, retry, saving: inFlight > 0, error, clearError, lastSavedAt, setLastSavedAt };
}
