import { useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StarIcon, StarOffIcon, TagIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import {
  applicationsPageQueryKey,
  type Application,
  type ApplicationsPageResult,
} from '#/features/applications/graphql/applicationsPageQueries';
import { deleteApplicationsWithUndo } from '../lib/deleteWithUndo';
import type { useBulkActions } from '../hooks/useBulkActions';
import { StatusSelect } from './StatusSelect';

export function BulkActionBar({
  selectedIds,
  apps,
  onClear,
  bulk,
  status,
  starred,
  likelyGhosted,
  searchTerm,
}: {
  selectedIds: Set<string>;
  apps: Application[];
  onClear: () => void;
  bulk: ReturnType<typeof useBulkActions>;
  status: string | undefined;
  starred: boolean | undefined;
  likelyGhosted: boolean | undefined;
  searchTerm: string;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [tagInput, setTagInput] = useState('');
  const ids = [...selectedIds];

  const onAddTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    bulk.bulkAddTag(ids, tag, apps);
    setTagInput('');
  };

  const onDelete = () => {
    // Must match the exact key applicationsPageQueryOptions registers this
    // query under (including the active filters) — getQueryData/setQueryData
    // require an exact key match, unlike invalidateQueries' prefix matching.
    const queryKey = applicationsPageQueryKey(status, starred, searchTerm, likelyGhosted);
    // Snapshot all pages of the infinite query
    const snapshot = qc.getQueryData<InfiniteData<ApplicationsPageResult>>(queryKey);
    // Optimistically remove selected apps from all pages
    qc.setQueryData<InfiniteData<ApplicationsPageResult>>(queryKey, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          applicationsPage: {
            ...page.applicationsPage,
            items: page.applicationsPage.items.filter((a) => !ids.includes(a.id)),
          },
        })),
      };
    });
    // The rows are already gone from the cache above; the delete goes out now
    // rather than on a timer, and Undo restores them server-side.
    onClear();
    deleteApplicationsWithUndo(qc, ids, t('applications.deleted', { count: ids.length }), () => {
      qc.setQueryData(queryKey, snapshot);
      toast.dismiss();
    });
  };

  return (
    // bottom-16 at every breakpoint (was lg:bottom-4 on desktop): the chat
    // dock's own persistent footer bar (-chat-dock-footer.tsx) is fixed
    // bottom-0, h-12 (48px), same z-40 — bottom-4 overlapped it, so its
    // buttons intercepted clicks meant for this bar's own buttons.
    <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-white shadow-lg dark:bg-stone-700">
        <span className="pr-1 text-sm font-medium">
          {t('applications.selectedCount', { count: ids.length })}
        </span>

        <StatusSelect
          value=""
          disabled={bulk.isPending}
          onChange={(next) => {
            if (next) bulk.bulkUpdateStatus(ids, next as ApplicationStatus);
          }}
          label={t('applications.changeStatusPlaceholder')}
          placeholder={t('applications.changeStatusPlaceholder')}
          variant="dark"
          resetAfterSelect
        />

        <div className="flex items-center gap-1">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddTag();
              }
            }}
            placeholder={t('applications.addTagPlaceholder')}
            disabled={bulk.isPending}
            className="w-24 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm placeholder-stone-400 disabled:opacity-60 dark:border-stone-500 dark:bg-stone-600"
          />
          <button
            type="button"
            onClick={onAddTag}
            disabled={bulk.isPending || !tagInput.trim()}
            aria-label={t('applications.addTagToSelected')}
            className="rounded-lg p-1.5 transition-colors hover:bg-stone-800 disabled:opacity-60 dark:hover:bg-stone-600"
          >
            <TagIcon size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => bulk.bulkSetStarred(ids, true)}
          disabled={bulk.isPending}
          aria-label={t('applications.starSelected')}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-stone-800 disabled:opacity-60 dark:hover:bg-stone-600"
        >
          <StarIcon size={14} /> <span className="hidden sm:inline">{t('applications.star')}</span>
        </button>
        <button
          type="button"
          onClick={() => bulk.bulkSetStarred(ids, false)}
          disabled={bulk.isPending}
          aria-label={t('applications.unstarSelected')}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-stone-800 disabled:opacity-60 dark:hover:bg-stone-600"
        >
          <StarOffIcon size={14} />{' '}
          <span className="hidden sm:inline">{t('applications.unstar')}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={bulk.isPending}
          aria-label={t('applications.deleteSelected')}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-900/40 disabled:opacity-60"
        >
          <Trash2Icon size={14} /> <span className="hidden sm:inline">{t('common.delete')}</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={t('applications.clearSelection')}
          className="ml-1 rounded-lg p-1.5 transition-colors hover:bg-stone-800 dark:hover:bg-stone-600"
        >
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
}
