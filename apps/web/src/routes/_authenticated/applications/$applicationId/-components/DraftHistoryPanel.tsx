import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import {
  CREATE_DRAFT_VERSION_MUTATION,
  DRAFT_VERSIONS_QUERY,
  DRAFT_VERSION_QUERY,
  RESTORE_DRAFT_VERSION_MUTATION,
  draftVersionQueryKey,
  draftVersionsQueryKey,
  type DraftVersionPreview,
  type DraftVersionSummary,
  type RestoredDraft,
} from '../-draftHistoryQueries';

interface DraftHistoryPanelProps {
  draftId: string;
  /**
   * Sends any edit still waiting out the save debounce and waits for it. Resolves
   * false when the editor's own save failed: a version or a restore must not run
   * against content the server never received.
   */
  prepare: () => Promise<boolean>;
  /** The server has restored a version; the page puts its content into the editor. */
  onRestored: (draft: RestoredDraft) => void;
  /** Changes whenever the draft is saved, so the list shows the snapshot the save made. */
  refreshKey: number;
}

const SOURCE_KEYS = {
  autosave: 'draftHistory.sourceAutosave',
  ai: 'draftHistory.sourceAi',
  manual: 'draftHistory.sourceManual',
  restore: 'draftHistory.sourceRestore',
} as const;

/**
 * Draft history (JEF-584): the versions kept of this draft, a read-only preview
 * of one, and Restore. It is named "Draft history", not "versions", so it is not
 * confused with the exported-document versions on the application.
 */
export function DraftHistoryPanel({
  draftId,
  prepare,
  onRestored,
  refreshKey,
}: DraftHistoryPanelProps) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const versions = useQuery({
    queryKey: draftVersionsQueryKey(draftId),
    queryFn: () =>
      gqlClient
        .request<{ documentDraftVersions: DraftVersionSummary[] }>(DRAFT_VERSIONS_QUERY, {
          draftId,
        })
        .then((res) => res.documentDraftVersions),
  });

  const preview = useQuery({
    queryKey: draftVersionQueryKey(selectedId ?? ''),
    enabled: selectedId !== null,
    queryFn: () =>
      gqlClient
        .request<{ documentDraftVersion: DraftVersionPreview }>(DRAFT_VERSION_QUERY, {
          id: selectedId,
        })
        .then((res) => res.documentDraftVersion),
  });

  // The draft was saved again, which may have kept a snapshot.
  useEffect(() => {
    if (refreshKey > 0) {
      void queryClient.invalidateQueries({ queryKey: draftVersionsQueryKey(draftId) });
    }
  }, [refreshKey, draftId, queryClient]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: draftVersionsQueryKey(draftId) });

  /** Runs `action` once the editor's content is on the server. */
  const afterSettling = async (action: () => Promise<void>) => {
    setError(null);
    try {
      if (!(await prepare())) {
        setError(t('draftHistory.unsaved'));
        return;
      }
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const save = useMutation({
    mutationFn: () =>
      afterSettling(async () => {
        await gqlClient.request(CREATE_DRAFT_VERSION_MUTATION, { draftId });
        toast.success(t('draftHistory.saved'));
        await refresh();
      }),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      afterSettling(async () => {
        const res = await gqlClient.request<{ restoreDocumentDraftVersion: RestoredDraft }>(
          RESTORE_DRAFT_VERSION_MUTATION,
          { versionId },
        );
        onRestored(res.restoreDocumentDraftVersion);
        toast.success(t('draftHistory.restored'));
        setSelectedId(null);
        await refresh();
      }),
  });

  const confirmRestore = (versionId: string) => {
    if (confirm(t('draftHistory.restoreConfirm'))) restore.mutate(versionId);
  };

  const busy = save.isPending || restore.isPending;
  const when = (iso: string) => new Date(iso).toLocaleString();

  return (
    <section
      aria-label={t('draftHistory.title')}
      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('draftHistory.title')}
        </h2>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => save.mutate()}>
          {t('draftHistory.save')}
        </Button>
      </div>

      {error && (
        <Alert className="mb-3" role="alert">
          {error}
        </Alert>
      )}

      {versions.isError && <Alert role="alert">{t('draftHistory.loadFailed')}</Alert>}
      {versions.data?.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('draftHistory.empty')}</p>
      )}

      <ul className="space-y-1">
        {versions.data?.map((version) => (
          <li key={version.id}>
            <button
              type="button"
              aria-pressed={selectedId === version.id}
              onClick={() => setSelectedId(version.id === selectedId ? null : version.id)}
              className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
                selectedId === version.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {t(SOURCE_KEYS[version.source])}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {when(version.createdAt)} ·{' '}
                {t('draftHistory.characters', {
                  count: version.characterCount,
                  formatted: version.characterCount.toLocaleString(),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selectedId && (
        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {t('draftHistory.preview')}
          </h3>
          {preview.isError && <Alert role="alert">{t('draftHistory.loadFailed')}</Alert>}
          {preview.data && (
            <>
              <pre
                tabIndex={0}
                className="max-h-64 overflow-auto rounded-sm bg-gray-50 p-2 text-xs whitespace-pre-wrap text-gray-800 dark:bg-gray-800 dark:text-gray-200"
              >
                {preview.data.plainText}
              </pre>
              <Button
                className="mt-2"
                size="sm"
                disabled={busy}
                onClick={() => confirmRestore(preview.data.id)}
              >
                {t('draftHistory.restore')}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
