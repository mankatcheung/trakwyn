import { Link } from '@tanstack/react-router';
import { StarIcon } from 'lucide-react';
import { Card, Checkbox } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import type { Application } from '#/features/applications/graphql/applicationsPageQueries';
import type { ApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';
import { StatusBadge } from './StatusBadge';

interface ApplicationRowProps {
  app: Application;
  displayFields: ApplicationDisplayFields;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function ApplicationRow({ app, displayFields, selected, onToggle }: ApplicationRowProps) {
  const { t } = useLocale();
  return (
    <Card
      key={app.id}
      className="flex items-center gap-3 px-5 py-4 transition-colors hover:border-blue-300 dark:hover:border-blue-600"
    >
      <Checkbox
        className="shrink-0"
        checked={selected}
        onChange={() => onToggle(app.id)}
        aria-label={t('applications.selectCompany', { company: app.company })}
      />
      <Link
        to="/applications/$applicationId"
        params={{ applicationId: app.id }}
        className="group flex min-w-0 flex-1 items-center justify-between"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{app.company}</p>
          {(displayFields.role || (displayFields.location && app.location)) && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
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
                  className="inline-flex items-center rounded-sm bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
              {app.tags.length > 3 && (
                <span className="text-xs text-stone-400">+{app.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {displayFields.starred && app.starred && (
            <StarIcon size={13} className="shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          {displayFields.date && (
            <p className="hidden text-xs text-stone-400 sm:block">
              {app.appliedAt
                ? new Date(app.appliedAt).toLocaleDateString()
                : new Date(app.createdAt).toLocaleDateString()}
            </p>
          )}
          {displayFields.status && <StatusBadge status={app.status} />}
          {displayFields.ghosted && app.likelyGhosted && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {t('applications.likelyGhosted')}
            </span>
          )}
        </div>
      </Link>
    </Card>
  );
}
