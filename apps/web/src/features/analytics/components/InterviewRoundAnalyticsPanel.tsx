import { useQuery } from '@tanstack/react-query';
import { useLocale } from '#/lib/i18n';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
import { interviewRoundAnalyticsQueryOptions } from '../graphql/interviewRoundQueries';

// Below this many decided (passed+failed) rounds, a pass rate is more noise
// than signal — flagged rather than hidden, mirroring JEF-58's
// small-sample threshold for interview rates.
const SMALL_SAMPLE_THRESHOLD = 3;

function formatRounds(n: number | null): string {
  if (n === null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Complements DocumentVersionOutcomesPanel (JEF-58), which only measures
 * whether an application led to an interview at all. This shows how those
 * interviews actually went: pass rate per round type, and how many rounds
 * applications typically go through before an offer vs. a rejection.
 * Fetches independently and degrades silently on error, same as the other
 * analytics panels — this is a supplementary insight, not critical path.
 */
export function InterviewRoundAnalyticsPanel() {
  const { t } = useLocale();
  const { data, isLoading } = useQuery(interviewRoundAnalyticsQueryOptions);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const analytics = data?.interviewRoundAnalytics;
  if (!analytics) return null;

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {t('interviewAnalytics.title')}
      </h2>
      <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
        {t('interviewAnalytics.description')}
      </p>

      {analytics.byType.length === 0 ? (
        <EmptyState
          size="compact"
          className="py-8"
          message={t('interviewAnalytics.emptyMessage')}
        />
      ) : (
        <div className="mb-6 space-y-3">
          {analytics.byType.map((stat) => {
            const decided = stat.passed + stat.failed;
            const passRate = decided > 0 ? Math.round((stat.passed / decided) * 100) : 0;
            const smallSample = decided < SMALL_SAMPLE_THRESHOLD;
            return (
              <div
                key={stat.type}
                className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-0 dark:border-gray-700"
              >
                <span className="w-20 shrink-0 text-sm text-gray-900 dark:text-gray-100">
                  {t(`interviews.${stat.type}`, { defaultValue: stat.type })}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {t('interviewAnalytics.passedOfDecided', { passed: stat.passed, decided })}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-full bg-green-500" style={{ width: `${passRate}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {decided > 0 ? `${passRate}%` : '—'}
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

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-gray-700">
        <div>
          <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
            {t('interviewAnalytics.roundsBeforeOffer')}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatRounds(analytics.roundsToOffer.median)}{' '}
            <span className="text-xs font-normal text-gray-400">
              {t('interviewAnalytics.median')}
            </span>
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {analytics.roundsToOffer.sampleSize > 0
              ? t('interviewAnalytics.offersCount', { count: analytics.roundsToOffer.sampleSize })
              : t('interviewAnalytics.noOffersYet')}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">
            {t('interviewAnalytics.roundsBeforeRejection')}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatRounds(analytics.roundsToRejection.median)}{' '}
            <span className="text-xs font-normal text-gray-400">
              {t('interviewAnalytics.median')}
            </span>
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {analytics.roundsToRejection.sampleSize > 0
              ? t('interviewAnalytics.rejectionsCount', {
                  count: analytics.roundsToRejection.sampleSize,
                })
              : t('interviewAnalytics.noRejectionsYet')}
          </p>
        </div>
      </div>
    </Card>
  );
}
