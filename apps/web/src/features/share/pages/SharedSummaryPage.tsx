import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useDates } from '#/hooks/useDates';
import { Alert } from '@trakwyn/ui';
import { SHARED_SUMMARY_QUERY } from '#/features/share/graphql/sharedSummaryQueries';

interface StatusCount {
  status: string;
  count: number;
}

interface SharedSummary {
  statusCounts: StatusCount[];
  totalApplications: number;
  totalInterviews: number;
  upcomingInterviews: number;
  applicationsUpdatedLast7Days: number;
  generatedAt: string;
}

export function SharedSummaryPage() {
  const { t } = useLocale();
  const dates = useDates();
  const { token } = useSearch({ from: '/share' });

  const { data, isLoading } = useQuery({
    queryKey: ['sharedSummary', token],
    queryFn: () =>
      gqlClient.request<{ sharedSummary: SharedSummary | null }>(SHARED_SUMMARY_QUERY, { token }),
    enabled: Boolean(token),
  });

  const summary = data?.sharedSummary;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12 dark:bg-stone-900">
      <div className="w-full max-w-lg space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-stone-800">
        <div>
          <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
            {t('sharedSummary.title')}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('sharedSummary.description')}
          </p>
        </div>

        {!token ? (
          <Alert>{t('sharedSummary.missingToken')}</Alert>
        ) : isLoading ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{t('common.loading')}</p>
        ) : !summary ? (
          <Alert>{t('sharedSummary.invalidOrRevoked')}</Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SummaryStat label={t('applications.title')} value={summary.totalApplications} />
              <SummaryStat
                label={t('applicationDetail.tabInterviews')}
                value={summary.totalInterviews}
              />
              <SummaryStat
                label={t('sharedSummary.upcomingInterviews')}
                value={summary.upcomingInterviews}
              />
              <SummaryStat
                label={t('sharedSummary.updatedLast7Days')}
                value={summary.applicationsUpdatedLast7Days}
              />
            </div>

            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                {t('sharedSummary.byStatus')}
              </h2>
              <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
                {summary.statusCounts.map((sc) => (
                  <li
                    key={sc.status}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-stone-700 dark:text-stone-300">
                      {t(`status.${sc.status}`, { defaultValue: sc.status })}
                    </span>
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {sc.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-stone-400">
              {t('sharedSummary.generatedAt', {
                date: dates.dateTime(summary.generatedAt),
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-stone-50 p-4 dark:bg-stone-900">
      <p className="text-2xl font-medium text-stone-900 dark:text-stone-100">{value}</p>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{label}</p>
    </div>
  );
}
