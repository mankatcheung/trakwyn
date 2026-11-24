import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Card } from '@trakwyn/ui';
import { RotateCcwIcon, Trash2Icon, TrashIcon } from 'lucide-react';
import { StatusBadge } from '../../applications/components/StatusBadge';
import {
  PERMANENTLY_DELETE_APPLICATION,
  RESTORE_APPLICATION,
  daysUntilPurge,
} from '../../applications/graphql/trashQueries';
import { InfoItem } from './header/InfoItem';
import type { Application } from '../graphql/applicationQuery';

/**
 * What a trashed application's own URL renders instead of the full detail
 * page. It is deliberately not the detail page with a banner on top: every
 * tab there (notes, interviews, contacts, documents…) resolves through a use
 * case that reads the application via the trash-filtered `findById`, so those
 * panels would each fail with NOT_FOUND. This shows the fields carried by the
 * application row itself — enough to decide restore vs. delete — and nothing
 * that would need a second, failing fetch.
 */
export function TrashedApplicationView({ app }: { app: Application }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const days = daysUntilPurge(app.purgeAt ?? null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['applications'] });

  const restore = useMutation({
    mutationFn: () => gqlClient.request(RESTORE_APPLICATION, { id: app.id }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['application', app.id] });
      invalidate();
      toast.success(t('trash.restoredToast'));
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const purge = useMutation({
    mutationFn: () => gqlClient.request(PERMANENTLY_DELETE_APPLICATION, { id: app.id }),
    onSuccess: () => {
      invalidate();
      toast.success(t('trash.permanentlyDeletedToast'));
      navigate({ to: '/applications/trash' });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-4">
        <Link
          to="/applications/trash"
          className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {t('trash.backToTrash')}
        </Link>
      </div>

      <div
        role="status"
        className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
      >
        <TrashIcon size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="font-medium text-amber-900 dark:text-amber-200">{t('trash.bannerTitle')}</p>
          <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">
            {days === null
              ? t('trash.bannerBodyUnknown')
              : days === 0
                ? t('trash.deletesToday')
                : t('trash.deletesInDays', { count: days })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => restore.mutate()}
              disabled={restore.isPending || purge.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-blue-800 dark:bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-900 dark:hover:bg-blue-700 disabled:opacity-50"
            >
              <RotateCcwIcon size={14} />
              {t('trash.restore')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(t('trash.deleteForeverConfirm', { company: app.company }))) return;
                purge.mutate();
              }}
              disabled={restore.isPending || purge.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2Icon size={14} />
              {t('trash.deleteForever')}
            </button>
          </div>
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-xl font-medium text-stone-900 dark:text-stone-100">
              {app.company}
            </h1>
            <p className="mt-0.5 text-stone-500 dark:text-stone-400">{app.role}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid-cols-3">
          {app.location && (
            <InfoItem label={t('applicationForm.locationLabel')} value={app.location} />
          )}
          {app.salaryRange && (
            <InfoItem label={t('applicationDetail.salaryLabel')} value={app.salaryRange} />
          )}
          {app.appliedAt && (
            <InfoItem
              label={t('applicationDetail.appliedLabel')}
              value={new Date(app.appliedAt).toLocaleDateString()}
            />
          )}
          {app.source && <InfoItem label={t('applicationForm.sourceLabel')} value={app.source} />}
        </dl>

        {app.description && (
          <div className="mt-4">
            <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">
              {t('applicationDetail.descriptionLabel')}
            </h2>
            <p className="mt-1 text-sm whitespace-pre-wrap text-stone-700 dark:text-stone-300">
              {app.description}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
