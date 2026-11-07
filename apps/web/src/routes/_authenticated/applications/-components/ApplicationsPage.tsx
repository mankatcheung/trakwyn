import { Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { deleteApplicationsWithUndo } from '../-deleteWithUndo';
import { ApplicationCapNotice } from '#/components/ApplicationCapNotice';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { Card, Checkbox, EmptyState, Skeleton, Spinner } from '@trakwyn/ui';
import { StatusBadge } from '../../-components/StatusBadge';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { useBulkActions } from '../-useBulkActions';
import { useInfiniteScrollSentinel } from '#/lib/useInfiniteScrollSentinel';
import {
  BriefcaseIcon,
  GhostIcon,
  KanbanIcon,
  ListFilterIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  StarOffIcon,
  TagIcon,
  Trash2Icon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Route } from '../index';
import {
  applicationsPageQueryKey,
  applicationsPageQueryOptions,
  type Application,
  type ApplicationsPageResult,
} from '../index';
import { StatusSelect } from '#/components/StatusSelect';
import { ApplicationDisplayFieldsPicker } from '#/components/ApplicationDisplayFieldsPicker';
import { useApplicationDisplayFields } from '#/lib/applicationDisplayFields';

function ApplicationsPage() {
  const { t } = useLocale();
  const { status, starred, likelyGhosted } = Route.useSearch();
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulk = useBulkActions();
  const { fields: displayFields, toggleField: toggleDisplayField } = useApplicationDisplayFields();

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(applicationsPageQueryOptions(status, starred, searchTerm, likelyGhosted));

  const apps = useMemo(
    () => data?.pages.flatMap((page) => page.applicationsPage.items) ?? [],
    [data],
  );

  const sentinelRef = useInfiniteScrollSentinel(() => fetchNextPage(), Boolean(hasNextPage));

  const allSelected = apps.length > 0 && apps.every((a) => selectedIds.has(a.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) apps.forEach((a) => next.delete(a.id));
      else apps.forEach((a) => next.add(a.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const selectedCount = selectedIds.size;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('applications.title')}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            to="/applications/trash"
            aria-label={t('trash.title')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:border-gray-700 dark:hover:text-gray-200"
          >
            <TrashIcon size={15} />
            <span className="hidden sm:inline">{t('trash.title')}</span>
          </Link>
          <Link
            to="/applications/board"
            aria-label={t('applications.switchToBoardView')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:border-gray-700 dark:hover:text-gray-200"
          >
            <KanbanIcon size={15} />
            <span className="hidden sm:inline">{t('applications.board')}</span>
          </Link>
          <Link
            to="/applications/new"
            aria-label={t('applications.newApplicationAria')}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <PlusIcon size={15} />
            <span className="hidden sm:inline">{t('applications.new')}</span>
          </Link>
        </div>
      </div>

      <ApplicationCapNotice />

      <div className="relative mb-4">
        <SearchIcon
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
        />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('applications.searchPlaceholder')}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-8 pl-9 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* JEF-232: below sm each control collapses to its icon so the four of
          them share one phone row; labels come back at sm. */}
      <div className="mb-6 flex items-center gap-2 sm:gap-3">
        <StatusSelect
          value={status ?? ''}
          onChange={(next) => {
            const params = new URLSearchParams(window.location.search);
            if (next) params.set('status', next);
            else params.delete('status');
            window.location.search = params.toString();
          }}
          label={t('applications.filterByStatus')}
          placeholder={t('applications.allStatuses')}
          iconOnlyOnMobile
          mobileIcon={<ListFilterIcon size={16} />}
        />
        <Link
          to="/applications"
          search={starred ? {} : { starred: true }}
          aria-label={t('applications.starred')}
          className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs capitalize transition-colors ${
            starred
              ? 'border-yellow-400 bg-yellow-400 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-yellow-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <StarIcon size={14} className={starred ? 'fill-white' : ''} />
          <span className="hidden sm:inline">{t('applications.starred')}</span>
        </Link>
        <Link
          to="/applications"
          search={likelyGhosted ? {} : { likelyGhosted: true }}
          aria-label={t('applications.likelyGhosted')}
          className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            likelyGhosted
              ? 'border-amber-500 bg-amber-500 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-amber-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <GhostIcon size={14} />
          <span className="hidden sm:inline">{t('applications.likelyGhosted')}</span>
        </Link>
        <div className="ml-auto">
          <ApplicationDisplayFieldsPicker fields={displayFields} onToggle={toggleDisplayField} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : apps.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<BriefcaseIcon size={40} />}
          message={
            searchTerm
              ? t('applications.noApplicationsMatching', { term: searchTerm })
              : status
                ? t('applications.noApplicationsWithStatus', { status: t(`status.${status}`) })
                : likelyGhosted
                  ? t('applications.noApplicationsGhosted')
                  : t('applications.noApplicationsYet')
          }
        />
      ) : (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-gray-500 select-none dark:text-gray-400">
            <Checkbox
              checked={allSelected}
              onChange={toggleAll}
              aria-label={t(allSelected ? 'applications.deselectAll' : 'applications.selectAll')}
            />
            {selectedCount > 0
              ? t('applications.selectedOfTotal', { count: selectedCount, total: apps.length })
              : t('applications.selectAll')}
          </label>

          {apps.map((app) => (
            <Card
              key={app.id}
              className="flex items-center gap-3 px-5 py-4 transition-colors hover:border-blue-300 dark:hover:border-blue-600"
            >
              <Checkbox
                className="shrink-0"
                checked={selectedIds.has(app.id)}
                onChange={() => toggleOne(app.id)}
                aria-label={t('applications.selectCompany', { company: app.company })}
              />
              <Link
                to="/applications/$applicationId"
                params={{ applicationId: app.id }}
                className="group flex min-w-0 flex-1 items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {app.company}
                  </p>
                  {(displayFields.role || (displayFields.location && app.location)) && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {[
                        displayFields.role ? app.role : null,
                        displayFields.location && app.location ? app.location : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {displayFields.tags && app.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {app.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-sm bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        >
                          {tag}
                        </span>
                      ))}
                      {app.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{app.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {displayFields.starred && app.starred && (
                    <StarIcon size={13} className="shrink-0 fill-yellow-400 text-yellow-400" />
                  )}
                  {displayFields.date && (
                    <p className="hidden text-xs text-gray-400 sm:block">
                      {app.appliedAt
                        ? new Date(app.appliedAt).toLocaleDateString()
                        : new Date(app.createdAt).toLocaleDateString()}
                    </p>
                  )}
                  {displayFields.status && <StatusBadge status={app.status} />}
                  {displayFields.ghosted && app.likelyGhosted && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {t('applications.likelyGhosted')}
                    </span>
                  )}
                </div>
              </Link>
            </Card>
          ))}

          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4 text-gray-400">
              <Spinner size="md" />
            </div>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          apps={apps}
          onClear={clearSelection}
          bulk={bulk}
          status={status}
          starred={starred}
          likelyGhosted={likelyGhosted}
          searchTerm={searchTerm}
        />
      )}
    </div>
  );
}

function BulkActionBar({
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
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-lg dark:bg-gray-700">
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
            className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm placeholder-gray-400 disabled:opacity-60 dark:border-gray-500 dark:bg-gray-600"
          />
          <button
            type="button"
            onClick={onAddTag}
            disabled={bulk.isPending || !tagInput.trim()}
            aria-label={t('applications.addTagToSelected')}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-800 disabled:opacity-60 dark:hover:bg-gray-600"
          >
            <TagIcon size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => bulk.bulkSetStarred(ids, true)}
          disabled={bulk.isPending}
          aria-label={t('applications.starSelected')}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-800 disabled:opacity-60 dark:hover:bg-gray-600"
        >
          <StarIcon size={14} /> <span className="hidden sm:inline">{t('applications.star')}</span>
        </button>
        <button
          type="button"
          onClick={() => bulk.bulkSetStarred(ids, false)}
          disabled={bulk.isPending}
          aria-label={t('applications.unstarSelected')}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-800 disabled:opacity-60 dark:hover:bg-gray-600"
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
          className="ml-1 rounded-lg p-1.5 transition-colors hover:bg-gray-800 dark:hover:bg-gray-600"
        >
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
}

export { ApplicationsPage };
