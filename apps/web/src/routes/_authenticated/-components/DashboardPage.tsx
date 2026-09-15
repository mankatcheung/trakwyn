import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '#/components/ErrorState';
import { useLocale } from '#/lib/i18n';
import { Card, EmptyState, ProgressBar, Skeleton } from '@trakwyn/ui';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  PlusIcon,
  StarIcon,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { OnboardingChecklist } from './OnboardingChecklist';
import {
  applicationsQueryOptions,
  calendarEventsQueryOptions,
  weeklyApplicationGoalQueryOptions,
  onboardingChecklistQueryOptions,
  type CalendarEventKind,
} from '../dashboard';

const UPCOMING_EVENT_ICON: Record<CalendarEventKind, React.ReactNode> = {
  interview: <CalendarIcon size={13} className="shrink-0 text-purple-500" />,
  followUp: <AlertCircleIcon size={13} className="shrink-0 text-amber-500" />,
  applied: <FileTextIcon size={13} className="shrink-0 text-blue-500" />,
};

export function DashboardPage() {
  const { t } = useLocale();
  const UPCOMING_EVENT_LABEL: Record<CalendarEventKind, string> = {
    interview: t('dashboard.eventInterview'),
    followUp: t('applicationDetail.followUpLabel'),
    applied: t('status.applied'),
  };
  const { data, isLoading, isError, error, refetch } = useQuery(applicationsQueryOptions);
  const { data: calendarData } = useQuery(calendarEventsQueryOptions);
  const { data: goalData } = useQuery(weeklyApplicationGoalQueryOptions);
  const { data: onboardingData } = useQuery(onboardingChecklistQueryOptions);
  const goal = goalData?.weeklyApplicationGoal;

  const apps = data?.applications ?? [];
  const now = new Date();
  const counts = {
    total: apps.length,
    applied: apps.filter((a) => a.status === 'applied').length,
    interviewing: apps.filter((a) => a.status === 'interviewing').length,
    offered: apps.filter((a) => a.status === 'offered').length,
    overdue: apps.filter((a) => a.followUpAt && new Date(a.followUpAt) <= now).length,
  };

  const upcomingEvents = (calendarData?.calendarEvents ?? [])
    .filter((e) => e.type !== 'applied' && new Date(e.date) >= now)
    .slice(0, 5);

  const statItems = [
    {
      label: t('dashboard.statTotal'),
      value: counts.total,
      icon: <BriefcaseIcon size={20} />,
      color: 'blue',
    },
    {
      label: t('status.applied'),
      value: counts.applied,
      icon: <FileTextIcon size={20} />,
      color: 'indigo',
    },
    {
      label: t('status.interviewing'),
      value: counts.interviewing,
      icon: <ClockIcon size={20} />,
      color: 'yellow',
    },
    {
      label: t('status.offered'),
      value: counts.offered,
      icon: <CheckCircleIcon size={20} />,
      color: 'green',
    },
    {
      label: t('dashboard.statFollowUpDue'),
      value: counts.overdue,
      icon: <AlertCircleIcon size={20} />,
      color: 'orange',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('dashboard.title')}
        </h1>
        <Link
          to="/applications/new"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <PlusIcon size={15} />
          <span className="hidden sm:inline">{t('dashboard.newApplication')}</span>
        </Link>
      </div>

      {onboardingData && (
        <OnboardingChecklist data={onboardingData} hasApplications={apps.length > 0} />
      )}

      {/* Mobile: horizontal scrollable strip so 5 stats don't leave an orphaned card; sm+: grid */}
      <div className="-mx-4 mb-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mb-10 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
        {statItems.map((item) => (
          <StatCard
            key={item.label}
            {...item}
            loading={isLoading}
            className="w-32 shrink-0 snap-start sm:w-auto sm:shrink sm:snap-align-none"
          />
        ))}
      </div>

      {goal && (
        <section className="mb-10 rounded-xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-900/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('dashboard.weeklyGoalTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {t('dashboard.weeklyGoalProgress', {
                  current: goal.currentWeekCount,
                  goal: goal.weeklyApplicationGoal,
                })}
              </p>
            </div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {t('dashboard.streakWeeks', { count: goal.streakWeeks })}
            </p>
          </div>
          <ProgressBar
            className="mt-4"
            value={goal.currentWeekCount}
            max={goal.weeklyApplicationGoal}
            aria-label={t('dashboard.weeklyGoalProgress', {
              current: goal.currentWeekCount,
              goal: goal.weeklyApplicationGoal,
            })}
          />
        </section>
      )}

      {upcomingEvents.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('dashboard.upcomingTitle')}
            </h2>
            <Link to="/calendar" className="shrink-0 text-sm text-blue-600 hover:underline">
              {t('dashboard.viewCalendar')}
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 sm:overflow-x-auto sm:pb-1">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                to="/applications/$applicationId"
                params={{ applicationId: event.applicationId }}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-blue-300 sm:min-w-[220px] sm:flex-1 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
              >
                {UPCOMING_EVENT_ICON[event.type]}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {UPCOMING_EVENT_LABEL[event.type]} ·{' '}
                    {new Date(event.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {event.company}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{event.role}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboard.recentApplicationsTitle')}
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : apps.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<BriefcaseIcon size={40} />}
            message={t('applications.noApplicationsYet')}
            action={
              <Link
                to="/applications/new"
                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
              >
                {t('dashboard.addFirstOne')}
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {apps.slice(0, 8).map((app) => {
              const isOverdue = app.followUpAt && new Date(app.followUpAt) <= now;
              return (
                <Link
                  key={app.id}
                  to="/applications/$applicationId"
                  params={{ applicationId: app.id }}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {app.starred && (
                      <StarIcon size={13} className="shrink-0 fill-yellow-400 text-yellow-400" />
                    )}
                    {isOverdue && (
                      <AlertCircleIcon size={13} className="shrink-0 text-orange-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {app.company}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{app.role}</p>
                    </div>
                  </div>
                  <StatusBadge status={app.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  loading,
  className = '',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  className?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    yellow: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  };
  return (
    <Card className={`p-4 ${className}`}>
      <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${colors[color]}`}>
        {icon}
      </div>
      {loading ? (
        <div className="mb-1 h-7 w-12 animate-pulse rounded-sm bg-gray-100 dark:bg-gray-700" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </Card>
  );
}
