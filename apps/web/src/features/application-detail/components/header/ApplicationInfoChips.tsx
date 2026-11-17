import type { ReactNode } from 'react';
import {
  BanknoteIcon,
  CalendarIcon,
  ClockIcon,
  LinkIcon,
  MapPinIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import type { Application } from '../../graphql/applicationQuery';

/**
 * Location, salary, applied date, source and follow-up as a wrapping row of
 * chips instead of a labelled definition grid (JEF-208).
 *
 * The grid gave every fact a label above a value, which on a phone became one
 * fact per row and pushed the sections below the fold. The values are
 * self-describing — a date, a place, a salary range — so the icon carries the
 * label's job in a fraction of the height.
 */
function Chip({
  icon: Icon,
  children,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${toneClass}`}>
      <Icon size={13} className="shrink-0 opacity-70" />
      {children}
    </span>
  );
}

export function ApplicationInfoChips({ app }: { app: Application }) {
  const { t } = useLocale();
  const followUpDue = app.followUpAt ? new Date(app.followUpAt) <= new Date() : false;

  return (
    <div className="flex flex-wrap gap-1.5">
      {app.location && <Chip icon={MapPinIcon}>{app.location}</Chip>}
      {app.salaryRange && <Chip icon={BanknoteIcon}>{app.salaryRange}</Chip>}
      {app.appliedAt && (
        <Chip icon={CalendarIcon}>
          {t('applicationDetail.appliedLabel')} {new Date(app.appliedAt).toLocaleDateString()}
        </Chip>
      )}
      {app.followUpAt && (
        <Chip icon={ClockIcon} tone={followUpDue ? 'warning' : 'neutral'}>
          {t('applicationDetail.followUpLabel')} {new Date(app.followUpAt).toLocaleDateString()}
        </Chip>
      )}
      {app.source && <Chip icon={LinkIcon}>{app.source}</Chip>}
      {app.tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
