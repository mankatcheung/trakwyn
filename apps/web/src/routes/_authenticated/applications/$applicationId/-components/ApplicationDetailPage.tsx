import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeftIcon, MoreHorizontalIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { deleteApplicationWithUndo } from '../../-deleteWithUndo';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { Card, Skeleton } from '@trakwyn/ui';
import { StatusBadge } from '../../../-components/StatusBadge';
import { applicationQueryOptions, type Application } from '../-application-query';
import type { BoardApplication } from '../../-board-queries';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { TrashedApplicationView } from './TrashedApplicationView';
import { HealthScorePanel, type HealthScore } from './HealthScorePanel';
import { ApplicationInfoChips } from './ApplicationInfoChips';
import { ApplicationActionsSheet } from './ApplicationActionsSheet';
import { SectionIndex } from './SectionIndex';
import { SectionSidebar } from './SectionSidebar';
import { NotesTab } from './NotesTab';
import { ActivityTab } from './ActivityTab';
import { InterviewsTab } from './InterviewsTab';
import { ContactsTab } from './ContactsTab';
import { DocumentsTab } from './DocumentsTab';
import { CompanyBriefingTab } from './CompanyBriefingTab';
import { CoverLetterTab } from './CoverLetterTab';
import { ResumeMatchTab } from './ResumeMatchTab';
import { sectionById, type SectionCounts, type SectionId } from '../-sections';
import { Route } from '../index';

const UPDATE_APPLICATION = `
  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) { id starred status }
  }
`;
const HEALTH_SCORE_QUERY = `
  query ApplicationHealthScore($applicationId: ID!) {
    applicationHealthScore(applicationId: $applicationId) {
      score label
      criteria { key label points earned met }
    }
  }
`;
const SECTION_COUNTS_QUERY = `
  query ApplicationSectionCounts($id: ID!) {
    application(id: $id) {
      id
      sectionCounts { notes interviews contacts documents documentDrafts offers }
    }
  }
`;

export function ApplicationDetailPage() {
  const { t } = useLocale();
  const { applicationId } = Route.useParams();
  const { section } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [actionsOpen, setActionsOpen] = useState(false);

  // `section` absent means the phone is on the index screen; the desktop has
  // no such state — its sidebar and content are always both on screen, so it
  // falls back to Notes.
  const activeSection: SectionId = section ?? 'notes';
  const openSection = section;

  // Named in full rather than relatively: `to: '.'` resolves against whatever
  // the router thinks the current match is, which is one more thing to be
  // wrong about than simply saying where we are.
  const goToSearch = (search: { section?: SectionId }) =>
    navigate({ to: '/applications/$applicationId', params: { applicationId }, search });
  const openSectionAt = (id: SectionId) => goToSearch({ section: id });
  const backToIndex = () => goToSearch({});

  const {
    data: appData,
    isError: isAppError,
    error: appError,
    refetch: refetchApp,
  } = useQuery(applicationQueryOptions(applicationId));

  // Everything hanging off an application resolves through a use case that
  // looks the application up with the trash-filtered `findById`, so once it is
  // in Trash these would only fetch NOT_FOUND. The read-only view below needs
  // none of them.
  //
  // Gated on the application having *resolved*, not merely on it not being
  // known-trashed: firing while `appData` is still undefined would race the
  // answer and issue exactly the requests this avoids. It costs nothing in
  // practice — the route loader awaits `applicationQueryOptions`, so the entry
  // is already cached on first render.
  const isTrashed = Boolean(appData?.application.deletedAt);
  const canLoadPanels = Boolean(appData) && !isTrashed;

  const { data: healthScoreData } = useQuery({
    queryKey: ['healthScore', applicationId],
    queryFn: () =>
      gqlClient.request<{ applicationHealthScore: HealthScore }>(HEALTH_SCORE_QUERY, {
        applicationId,
      }),
    enabled: canLoadPanels,
  });

  // Its own cache entry rather than a field on `applicationQueryOptions`: the
  // edit page shares that query and has no use for six COUNT(*)s, and the
  // counts are invalidated on their own schedule as sections change.
  const { data: countsData } = useQuery({
    queryKey: ['sectionCounts', applicationId],
    queryFn: () =>
      gqlClient.request<{ application: { sectionCounts: SectionCounts } }>(SECTION_COUNTS_QUERY, {
        id: applicationId,
      }),
    enabled: canLoadPanels,
  });
  const counts = countsData?.application.sectionCounts;

  // Star and status are the same mutation with a different field, so they
  // share one optimistic updater rather than two near-copies of it.
  // Satisfies both caches at once: the board's `status` is the generated
  // union, the detail query's is a plain string.
  const patchCaches = (patch: Partial<Application> & Partial<BoardApplication>) => {
    qc.setQueryData<{ application: Application }>(['application', applicationId], (old) =>
      old ? { ...old, application: { ...old.application, ...patch } } : old,
    );
    qc.setQueriesData<{ applications: BoardApplication[] }>(
      { queryKey: ['applications'], exact: false },
      (old) => {
        if (!old?.applications) return old;
        return {
          ...old,
          applications: old.applications.map((a) =>
            a.id === applicationId ? { ...a, ...patch } : a,
          ),
        };
      },
    );
  };

  const settleApplication = () => {
    qc.invalidateQueries({ queryKey: ['application', applicationId] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  const changeStatus = useMutation({
    mutationFn: (status: ApplicationStatus) =>
      gqlClient.request(UPDATE_APPLICATION, { id: applicationId, input: { status } }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['application', applicationId] });
      const prevApp = qc.getQueryData<{ application: Application }>(['application', applicationId]);
      patchCaches({ status });
      return { prevApp };
    },
    onError: (_err, _status, context) => {
      if (context?.prevApp) qc.setQueryData(['application', applicationId], context.prevApp);
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
    onSettled: () => {
      settleApplication();
      // The status is a health-score criterion, and moving to a terminal
      // status changes the activity log too.
      qc.invalidateQueries({ queryKey: ['healthScore', applicationId] });
      qc.invalidateQueries({ queryKey: ['activity', applicationId] });
    },
  });

  const toggleStar = useMutation({
    mutationFn: (starred: boolean) =>
      gqlClient.request(UPDATE_APPLICATION, { id: applicationId, input: { starred } }),
    onMutate: async (starred) => {
      await qc.cancelQueries({ queryKey: ['application', applicationId] });
      const prevApp = qc.getQueryData<{ application: Application }>(['application', applicationId]);
      patchCaches({ starred });
      return { prevApp };
    },
    onError: (_err, _starred, context) => {
      if (context?.prevApp) qc.setQueryData(['application', applicationId], context.prevApp);
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
    onSettled: settleApplication,
  });

  const app = appData?.application;
  const healthScore = healthScoreData?.applicationHealthScore;

  if (isAppError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <ErrorState error={appError} onRetry={() => refetchApp()} />
      </div>
    );
  }

  if (!app)
    return (
      <div className="p-4 sm:p-8">
        <Skeleton className="h-8 w-64 rounded-sm" />
      </div>
    );

  if (app.deletedAt) return <TrashedApplicationView app={app} />;

  const sectionContent = (
    <>
      {activeSection === 'notes' && (
        <NotesTab applicationId={applicationId} enabled={canLoadPanels} />
      )}
      {activeSection === 'interviews' && (
        <InterviewsTab applicationId={applicationId} company={app.company} role={app.role} />
      )}
      {activeSection === 'contacts' && <ContactsTab applicationId={applicationId} />}
      {activeSection === 'activity' && <ActivityTab applicationId={applicationId} />}
      {activeSection === 'documents' && <DocumentsTab applicationId={applicationId} />}
      {activeSection === 'company-briefing' && <CompanyBriefingTab applicationId={applicationId} />}
      {activeSection === 'cover-letter' && <CoverLetterTab applicationId={applicationId} />}
      {activeSection === 'resume-match' && <ResumeMatchTab applicationId={applicationId} />}
      {activeSection === 'offers' && (
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

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      {/*
        Phone only, and only when drilled into a section: Back returns to the
        index rather than leaving the application, and the company stays on
        screen so you never lose track of which one you are inside.
      */}
      {openSection && (
        <div className="-mx-4 mb-4 flex items-center gap-1 border-b border-gray-200 px-2 pb-2 md:hidden dark:border-gray-700">
          <button
            type="button"
            onClick={backToIndex}
            aria-label={t('applicationDetail.backToSections')}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
              {t(sectionById(activeSection).labelKey)}
            </span>
            <span className="truncate text-xs text-gray-400">
              {app.company} · {app.role}
            </span>
          </div>
        </div>
      )}

      {/* The application's own header. On a phone it belongs to the index screen. */}
      <div className={openSection ? 'hidden md:block' : undefined}>
        <div className="mb-4">
          <a
            href="/applications"
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('applicationForm.backToApplications')}
          </a>
        </div>

        <Card className="mb-6 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{app.company}</h1>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400">{app.role}</p>
            </div>
            {/*
              One 44px trigger instead of four 32px icon buttons crowding the
              company name. Star, edit and delete moved into the sheet, where
              they get labels and rows big enough to hit (JEF-208).
            */}
            <button
              type="button"
              onClick={() => setActionsOpen(true)}
              aria-label={t('applicationDetail.moreActions')}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <MoreHorizontalIcon size={20} />
            </button>
          </div>

          <div className="mt-3">
            <StatusBadge status={app.status} />
          </div>

          <div className="mt-3">
            <ApplicationInfoChips app={app} />
          </div>

          {app.followUpAt && (
            <p className="mt-2 text-xs text-gray-400">{t('applicationDetail.emailReminderNote')}</p>
          )}

          {app.jobUrl && (
            <div className="mt-3">
              <dt className="text-xs text-gray-400">{t('applicationForm.jobUrlLabel')}</dt>
              <a
                href={app.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs break-all text-blue-600 hover:underline"
              >
                {app.jobUrl}
              </a>
            </div>
          )}

          {app.description && (
            <div className="mt-3">
              <dt className="mb-1 text-xs text-gray-400">
                {t('applicationDetail.descriptionLabel')}
              </dt>
              <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {app.description}
              </p>
            </div>
          )}

          {healthScore && <HealthScorePanel healthScore={healthScore} />}
        </Card>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <SectionSidebar active={activeSection} counts={counts} onOpen={openSectionAt} />

        {/* Phone: the index and a section are separate screens. Desktop: only the section. */}
        {!openSection && <SectionIndex counts={counts} onOpen={openSectionAt} />}

        {/*
          Hidden rather than unmounted on the phone index: the desktop needs it
          at all times, and on a phone it warms the default section so the
          first drill-down has nothing to wait for.
        */}
        <div className={`min-w-0 flex-1 ${openSection ? '' : 'hidden md:block'}`}>
          {sectionContent}
        </div>
      </div>

      <ApplicationActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        applicationId={applicationId}
        starred={app.starred}
        status={app.status}
        onToggleStar={() => toggleStar.mutate(!app.starred)}
        onChangeStatus={(status) => changeStatus.mutate(status)}
        onDelete={() => {
          // Sends the delete now and leaves immediately — undo is a real
          // restoreApplication call, so there is nothing to wait for.
          deleteApplicationWithUndo(
            qc,
            applicationId,
            t('applicationDetail.applicationDeletedToast'),
            () => navigate({ to: '/applications' }),
          );
        }}
      />
    </div>
  );
}
