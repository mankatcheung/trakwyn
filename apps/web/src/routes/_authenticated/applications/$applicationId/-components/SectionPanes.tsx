import { Activity, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import type { SectionId } from '../-sections';
import type { Application } from '../-application-query';
import { OverviewTab } from './OverviewTab';
import type { HealthScore } from './HealthScorePanel';
import { NotesTab } from './NotesTab';
import { ActivityTab } from './ActivityTab';
import { InterviewsTab } from './InterviewsTab';
import { ContactsTab } from './ContactsTab';
import { DocumentList } from './DocumentList';
import { ResumeGapsPanel } from './ResumeGapsPanel';
import { CompanyBriefingTab } from './CompanyBriefingTab';

/**
 * The sections whose local state is worth keeping when you look at another one:
 * a half-typed note, an open form, a scrolled list, an editor's open panels.
 * Overview, Activity, the briefing and Offers are cheap to remount and hold
 * nothing the user typed, so they unmount as before (JEF-611).
 */
// eslint-disable-next-line react-refresh/only-export-components -- non-component export; move to its own file when next touched (JEF-639).
export const KEEP_ALIVE_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'notes',
  'interviews',
  'contacts',
  'cover-letters',
  'resumes',
  'other-documents',
]);

interface SectionPanesProps {
  active: SectionId;
  applicationId: string;
  app: Application;
  healthScore?: HealthScore;
  /** False while the application is unresolved or in Trash: the panels must not fetch. */
  canLoadPanels: boolean;
}

/**
 * A section stays mounted, inside `<Activity mode="hidden">`, once it has been
 * opened. Until then it is not rendered at all, so opening the page still
 * costs one section's queries, not six.
 *
 * Hidden is not just `display: none`: React unmounts a hidden subtree's effects,
 * so a hidden tab's TanStack Query observers unsubscribe and it stops refetching
 * on focus or on an interval, while its DOM and state stay in memory. The cache
 * is shared, so a mutation made elsewhere still updates it for the next visit.
 */
export function SectionPanes({
  active,
  applicationId,
  app,
  healthScore,
  canLoadPanels,
}: SectionPanesProps) {
  const { t } = useLocale();
  const [opened, setOpened] = useState<ReadonlySet<SectionId>>(() => new Set([active]));

  // Derived during render, not in an effect: the section is in the set on the
  // same pass that first shows it. Replaced, not mutated.
  if (KEEP_ALIVE_SECTIONS.has(active) && !opened.has(active)) {
    setOpened(new Set([...opened, active]));
  }

  const kept = (id: SectionId, node: ReactNode) =>
    opened.has(id) || active === id ? (
      <Activity key={id} mode={active === id ? 'visible' : 'hidden'}>
        {node}
      </Activity>
    ) : null;

  return (
    <>
      {active === 'overview' && <OverviewTab app={app} healthScore={healthScore} />}
      {kept('notes', <NotesTab applicationId={applicationId} enabled={canLoadPanels} />)}
      {kept(
        'interviews',
        <InterviewsTab applicationId={applicationId} company={app.company} role={app.role} />,
      )}
      {kept('contacts', <ContactsTab applicationId={applicationId} />)}
      {active === 'activity' && <ActivityTab applicationId={applicationId} />}
      {kept(
        'cover-letters',
        <DocumentList applicationId={applicationId} category="cover_letter" />,
      )}
      {kept(
        'resumes',
        <>
          <ResumeGapsPanel applicationId={applicationId} />
          <DocumentList applicationId={applicationId} category="resume" />
        </>,
      )}
      {kept('other-documents', <DocumentList applicationId={applicationId} category="other" />)}
      {active === 'company-briefing' && <CompanyBriefingTab applicationId={applicationId} />}
      {active === 'offers' && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('applicationDetail.offerComparisonTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('applicationDetail.offerComparisonDescription')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/applications/$applicationId/offers"
              params={{ applicationId }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('applicationDetail.manageOffers')}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
