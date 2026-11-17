import { useQuery } from '@tanstack/react-query';
import { useLocale } from '#/lib/i18n';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
import { responseTimeAnalyticsQueryOptions } from '../graphql/responseTimeQueries';

// Below this many completed stage exits, a duration is more noise than
// signal — flagged rather than hidden, mirroring JEF-58's small-sample
// threshold for interview rates.
const SMALL_SAMPLE_THRESHOLD = 3;

function formatDays(n: number | null): string {
  if (n === null) return '—';
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}d`;
}

/**
 * ActivityLog's timestamped status_changed events are otherwise only ever
 * read one application at a time (the activity feed) — this aggregates
 * them into two views: how long applications typically sit in each stage
 * before moving on, and how long it takes to hear back after applying.
 * Fetches independently and degrades silently on error, same as the other
 * analytics panels — this is a supplementary insight, not critical path.
 */
export function ResponseTimeAnalyticsPanel() {
  const { t } = useLocale();
  const { data, isLoading } = useQuery(responseTimeAnalyticsQueryOptions);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const analytics = data?.responseTimeAnalytics;
  if (!analytics) return null;

  const maxMedian = Math.max(1, ...analytics.timeInStage.map((s) => s.medianDays ?? 0));

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {t('responseTime.title')}
      </h2>
      <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
        {t('responseTime.description')}
      </p>

      <div className="mb-6">
        <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
          {t('responseTime.firstResponseLabel')}
        </p>
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {formatDays(analytics.timeToFirstResponse.medianDays)}{' '}
          <span className="text-xs font-normal text-gray-400">
            {t('interviewAnalytics.median')}
          </span>
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {analytics.timeToFirstResponse.sampleSize > 0
            ? t('responseTime.applicationsCount', {
                count: analytics.timeToFirstResponse.sampleSize,
              })
            : t('responseTime.noResponsesYet')}
        </p>
      </div>

      {analytics.timeInStage.length === 0 ? (
        <EmptyState size="compact" className="py-8" message={t('responseTime.emptyMessage')} />
      ) : (
        <div className="space-y-3">
          {analytics.timeInStage.map((stat) => {
            const smallSample = stat.sampleSize < SMALL_SAMPLE_THRESHOLD;
            const widthPercent = ((stat.medianDays ?? 0) / maxMedian) * 100;
            return (
              <div
                key={stat.status}
                className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-0 dark:border-gray-700"
              >
                <span className="w-24 shrink-0 text-sm text-gray-900 dark:text-gray-100">
                  {t(`status.${stat.status}`, { defaultValue: stat.status })}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-full bg-blue-500" style={{ width: `${widthPercent}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {formatDays(stat.medianDays)}
                </span>
                {smallSample && (
                  <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                    {t('interviewAnalytics.smallSample')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
