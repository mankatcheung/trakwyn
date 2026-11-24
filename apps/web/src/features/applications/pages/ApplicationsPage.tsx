import { Link } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { ApplicationCapNotice } from '#/features/quota/components/ApplicationCapNotice';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { Checkbox, EmptyState, Skeleton, Spinner } from '@trakwyn/ui';
import { ApplicationRow } from '../components/ApplicationRow';
import { BulkActionBar } from '../components/BulkActionBar';
import { useBulkActions } from '../hooks/useBulkActions';
import { useInfiniteScrollSentinel } from '#/hooks/useInfiniteScrollSentinel';
import {
  BriefcaseIcon,
  GhostIcon,
  KanbanIcon,
  ListFilterIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { getRouteApi } from '@tanstack/react-router';
import { applicationsPageQueryOptions } from '#/features/applications/graphql/applicationsPageQueries';
import { StatusSelect } from '#/features/applications/components/StatusSelect';
import { ApplicationDisplayFieldsPicker } from '#/features/applications/components/ApplicationDisplayFieldsPicker';
import { useApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';

const route = getRouteApi('/_authenticated/applications/');

function ApplicationsPage() {
  const { t } = useLocale();
  const { status, starred, likelyGhosted } = route.useSearch();
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
        <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
          {t('applications.title')}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            to="/applications/trash"
            aria-label={t('trash.title')}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:text-stone-800 dark:border-stone-700 dark:hover:text-stone-200"
          >
            <TrashIcon size={15} />
            <span className="hidden sm:inline">{t('trash.title')}</span>
          </Link>
          <Link
            to="/applications/board"
            aria-label={t('applications.switchToBoardView')}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:text-stone-800 dark:border-stone-700 dark:hover:text-stone-200"
          >
            <KanbanIcon size={15} />
            <span className="hidden sm:inline">{t('applications.board')}</span>
          </Link>
          <Link
            to="/applications/new"
            aria-label={t('applications.newApplicationAria')}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-blue-800 dark:bg-blue-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-900 dark:hover:bg-blue-600"
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
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
        />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('applications.searchPlaceholder')}
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pr-8 pl-9 text-sm text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* JEF-232: below sm each control collapses to its icon so the four of
          them share one phone row; labels come back at sm. */}
      <div className="mb-6 flex items-center gap-2 sm:gap-3" data-screenshot="application-filters">
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
              : 'border-stone-200 bg-white text-stone-600 hover:border-yellow-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400'
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
              : 'border-stone-200 bg-white text-stone-600 hover:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400'
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
          <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-stone-500 select-none dark:text-stone-400">
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
            <ApplicationRow
              key={app.id}
              app={app}
              displayFields={displayFields}
              selected={selectedIds.has(app.id)}
              onToggle={toggleOne}
            />
          ))}

          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4 text-stone-400">
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

export { ApplicationsPage };
