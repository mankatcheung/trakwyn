import { Link } from '@tanstack/react-router';
import { StarIcon } from 'lucide-react';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { useLocale } from '#/lib/i18n';
import type { ApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';
import type { BoardApplication } from '../../graphql/boardQueries';
import { StatusBadge } from '../StatusBadge';

export function BoardCard({
  app,
  isOverlay,
  displayFields,
}: {
  app: BoardApplication;
  isOverlay?: boolean;
  displayFields: ApplicationDisplayFields;
}) {
  const { t } = useLocale();
  const showMetaRow =
    (displayFields.starred && app.starred) ||
    displayFields.date ||
    displayFields.status ||
    (displayFields.ghosted && app.likelyGhosted);
  return (
    <Link
      to="/applications/$applicationId"
      params={{ applicationId: app.id }}
      className={`block rounded-lg border border-stone-200 bg-white p-3 text-left transition-colors hover:border-blue-300 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-blue-600 ${isOverlay ? 'rotate-1 shadow-xl' : ''}`}
      onClick={(e) => {
        if (isOverlay) e.preventDefault();
      }}
    >
      <p className="line-clamp-2 text-xs font-medium text-stone-900 dark:text-stone-100">
        {app.company}
      </p>
      {displayFields.role && (
        <p className="mt-0.5 line-clamp-1 text-xs text-stone-500 dark:text-stone-400">{app.role}</p>
      )}
      {displayFields.location && app.location && (
        <p className="mt-0.5 line-clamp-1 text-xs text-stone-400">{app.location}</p>
      )}
      {displayFields.tags && app.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {app.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center truncate rounded-sm bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >
              {tag}
            </span>
          ))}
          {app.tags.length > 2 && (
            <span className="text-xs text-stone-400">+{app.tags.length - 2}</span>
          )}
        </div>
      )}
      {/* Date rides inline in the meta row rather than as its own stacked
          line: a taller card shifts the drag geometry the board's pointer
          tests are tuned against (JEF-230 e2e regression). */}
      {showMetaRow && (
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1">
            {displayFields.starred && app.starred && (
              <StarIcon size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
            )}
            {displayFields.date && (
              <span className="truncate text-xs text-stone-400">
                {new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {displayFields.status && <StatusBadge status={app.status as ApplicationStatus} />}
            {displayFields.ghosted && app.likelyGhosted && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {t('applications.likelyGhosted')}
              </span>
            )}
          </span>
        </div>
      )}
    </Link>
  );
}
