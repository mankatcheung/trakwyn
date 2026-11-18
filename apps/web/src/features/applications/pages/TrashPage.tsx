import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { Card, Checkbox, Skeleton } from '@trakwyn/ui';
import { RotateCcwIcon, Trash2Icon, TrashIcon, XIcon } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import {
  BULK_RESTORE_APPLICATIONS,
  EMPTY_TRASH,
  PERMANENTLY_DELETE_APPLICATION,
  RESTORE_APPLICATION,
  daysUntilPurge,
  trashedApplicationsQueryOptions,
  type BulkRestoreResult,
  type EmptyTrashResult,
  type TrashedApplication,
} from '../graphql/trashQueries';
import { EmptyTrashDialog } from '../components/trash/EmptyTrashDialog';

function CountdownLabel({ application }: { application: TrashedApplication }) {
  const { t } = useLocale();
  const days = daysUntilPurge(application.purgeAt);
  if (days === null) return null;
  return (
    <span className={days <= 3 ? 'text-red-600 dark:text-red-400' : undefined}>
      {days === 0 ? t('trash.deletesToday') : t('trash.deletesInDays', { count: days })}
    </span>
  );
}

export function TrashPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery(trashedApplicationsQueryOptions());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  const applications = data?.trashedApplications ?? [];

  // Both actions change what the applications list and the trash list contain,
  // so they invalidate the whole 'applications' prefix rather than trying to
  // patch two caches by hand.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['applications'] });

  // Selection is keyed by id, and the ids in it may disappear underneath us
  // (another tab, the nightly purge). Every action intersects with what is
  // actually on screen so a stale id can never be sent.
  const visibleSelectedIds = applications.filter((a) => selectedIds.has(a.id)).map((a) => a.id);
  const allSelected = applications.length > 0 && visibleSelectedIds.length === applications.length;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(applications.map((a) => a.id)));

  const clearSelection = () => setSelectedIds(new Set());

  const restore = useMutation({
    mutationFn: (id: string) => gqlClient.request(RESTORE_APPLICATION, { id }),
    onSuccess: () => {
      invalidate();
      toast.success(t('trash.restoredToast'));
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const restoreSelected = useMutation({
    mutationFn: async (ids: string[]) =>
      (await gqlClient.request(BULK_RESTORE_APPLICATIONS, { ids })) as BulkRestoreResult,
    onSuccess: (result) => {
      clearSelection();
      invalidate();
      toast.success(
        t('trash.restoredCountToast', { count: result.bulkRestoreApplications.restored }),
      );
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const purge = useMutation({
    mutationFn: (id: string) => gqlClient.request(PERMANENTLY_DELETE_APPLICATION, { id }),
    onSuccess: () => {
      invalidate();
      toast.success(t('trash.permanentlyDeletedToast'));
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const emptyTrash = useMutation({
    mutationFn: async () => (await gqlClient.request(EMPTY_TRASH)) as EmptyTrashResult,
    onSuccess: ({ emptyTrash: { deleted, failed } }) => {
      setConfirmingEmpty(false);
      clearSelection();
      invalidate();
      // Reported separately: a partly emptied Trash should say so rather than
      // claim a clean sweep over a list that still has rows in it.
      if (failed > 0) toast.warning(t('trash.emptiedPartiallyToast', { count: deleted, failed }));
      else toast.success(t('trash.emptiedToast', { count: deleted }));
    },
    onError: (err) => {
      setConfirmingEmpty(false);
      toast.error(getErrorMessage(err));
    },
  });

  const busy =
    restore.isPending || purge.isPending || restoreSelected.isPending || emptyTrash.isPending;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-4">
        <Link
          to="/applications"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {t('applicationForm.backToApplications')}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('trash.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('trash.description')}</p>
        </div>
        {applications.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingEmpty(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2Icon size={15} />
            {t('trash.emptyTrash')}
          </button>
        )}
      </div>

      {isError && (
        <div className="mt-6">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      )}

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      )}

      {!isLoading && !isError && applications.length === 0 && (
        <div className="py-12 text-center">
          <TrashIcon size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">{t('trash.empty')}</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="mt-6 mb-3 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Checkbox
            checked={allSelected}
            onChange={toggleAll}
            aria-label={t(allSelected ? 'applications.deselectAll' : 'applications.selectAll')}
          />
          {visibleSelectedIds.length > 0 ? (
            <>
              <span>
                {t('applications.selectedOfTotal', {
                  count: visibleSelectedIds.length,
                  total: applications.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => restoreSelected.mutate(visibleSelectedIds)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <RotateCcwIcon size={14} />
                {t('trash.restoreSelected')}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                aria-label={t('applications.clearSelection')}
                className="rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XIcon size={15} />
              </button>
            </>
          ) : (
            <span>{t('applications.selectAll')}</span>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {applications.map((app) => (
          <li key={app.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    className="mt-1 shrink-0"
                    checked={selectedIds.has(app.id)}
                    onChange={() => toggleOne(app.id)}
                    aria-label={t('applications.selectCompany', { company: app.company })}
                  />
                  <div className="min-w-0">
                    <Link
                      to="/applications/$applicationId"
                      params={{ applicationId: app.id }}
                      className="font-semibold text-gray-900 hover:underline dark:text-gray-100"
                    >
                      {app.company}
                    </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{app.role}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <CountdownLabel application={app} />
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={app.status} />
                  <button
                    type="button"
                    onClick={() => restore.mutate(app.id)}
                    disabled={busy}
                    aria-label={t('trash.restoreAria', { company: app.company })}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <RotateCcwIcon size={14} />
                    <span className="hidden sm:inline">{t('trash.restore')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // No undo path exists past this point, so unlike the
                      // soft delete on the list page this asks up front.
                      if (!confirm(t('trash.deleteForeverConfirm', { company: app.company })))
                        return;
                      purge.mutate(app.id);
                    }}
                    disabled={busy}
                    aria-label={t('trash.deleteForeverAria', { company: app.company })}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2Icon size={14} />
                    <span className="hidden sm:inline">{t('trash.deleteForever')}</span>
                  </button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <EmptyTrashDialog
        open={confirmingEmpty}
        count={applications.length}
        isPending={emptyTrash.isPending}
        onCancel={() => setConfirmingEmpty(false)}
        onConfirm={() => emptyTrash.mutate()}
      />
    </div>
  );
}
