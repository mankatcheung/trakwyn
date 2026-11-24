import { useQuery } from '@tanstack/react-query';
import { useLocale } from '#/lib/i18n';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
import {
  applicationChannelAnalyticsQueryOptions,
  type ApplicationGroupStat,
} from '../graphql/applicationChannelQueries';

// Below this many applications, response/offer rates are more noise than
// signal — flagged rather than hidden, mirroring JEF-58's small-sample
// threshold for interview rates.
const SMALL_SAMPLE_THRESHOLD = 3;

function GroupRow({ stat }: { stat: ApplicationGroupStat }) {
  const { t } = useLocale();
  const smallSample = stat.applicationCount < SMALL_SAMPLE_THRESHOLD;
  return (
    <div className="flex flex-col gap-1.5 border-b border-stone-100 py-2 last:border-0 sm:flex-row sm:items-center sm:gap-3 dark:border-stone-700">
      <span className="truncate text-sm text-stone-900 sm:min-w-0 sm:flex-1 dark:text-stone-100">
        {stat.label}
      </span>
      {/* `sm:contents` hoists these into the row above as direct flex items,
          so the fixed-width count/bar/% columns line up across every row —
          they're only wrapped together for the stacked mobile layout. */}
      <div className="flex flex-wrap items-center gap-2 sm:contents">
        <span className="w-14 shrink-0 text-xs text-stone-500 sm:w-16 sm:text-right dark:text-stone-400">
          {t('channelAnalytics.appsCount', { count: stat.applicationCount })}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-stone-100 sm:w-16 dark:bg-stone-700">
            <div className="h-full bg-purple-500" style={{ width: `${stat.responseRate}%` }} />
          </div>
          <span className="w-9 text-right text-xs font-medium text-stone-700 sm:w-10 dark:text-stone-300">
            {stat.responseRate}%
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-stone-100 sm:w-16 dark:bg-stone-700">
            <div className="h-full bg-green-500" style={{ width: `${stat.offerRate}%` }} />
          </div>
          <span className="w-9 text-right text-xs font-medium text-stone-700 sm:w-10 dark:text-stone-300">
            {stat.offerRate}%
          </span>
        </div>
        {smallSample && (
          <span className="shrink-0 text-xs text-stone-400 sm:whitespace-nowrap dark:text-stone-500">
            {t('interviewAnalytics.smallSample')}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Application.source and Application.tags are captured on every
 * application and, until now, never aggregated anywhere on the Analytics
 * page — this answers "which channel/tag is actually working for me."
 * Fetches independently and degrades silently on error, same as the other
 * analytics panels — this is a supplementary insight, not critical path.
 */
export function ApplicationChannelAnalyticsPanel() {
  const { t } = useLocale();
  const { data, isLoading } = useQuery(applicationChannelAnalyticsQueryOptions);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const analytics = data?.applicationChannelAnalytics;
  if (!analytics) return null;

  return (
    <Card className="p-6" data-screenshot="channel-analytics">
      <h2 className="mb-1 text-sm font-medium text-stone-700 dark:text-stone-300">
        {t('channelAnalytics.title')}
      </h2>
      <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">
        {t('channelAnalytics.description')}
      </p>

      <div className="mb-6">
        <h3 className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
          {t('channelAnalytics.bySource')}
        </h3>
        {analytics.bySource.length === 0 ? (
          <EmptyState
            size="compact"
            className="py-6"
            message={t('channelAnalytics.bySourceEmpty')}
          />
        ) : (
          <div className="space-y-1">
            {analytics.bySource.map((stat) => (
              <GroupRow key={stat.label} stat={stat} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
          {t('channelAnalytics.byTag')}
        </h3>
        {analytics.byTag.length === 0 ? (
          <EmptyState size="compact" className="py-6" message={t('channelAnalytics.byTagEmpty')} />
        ) : (
          <div className="space-y-1">
            {analytics.byTag.map((stat) => (
              <GroupRow key={stat.label} stat={stat} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
