import { useQuery } from '@tanstack/react-query';
import { useLocale } from '#/lib/i18n';
import { useDates } from '#/hooks/useDates';
import { Card, EmptyState, Skeleton } from '@trakwyn/ui';
import { offerAnalyticsQueryOptions } from '../graphql/offerAnalyticsQueries';

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // currency is free text with no ISO-4217 enforcement — fall back to a
    // plain number with the raw currency label if Intl rejects it.
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

/**
 * Offer is a full domain entity (base salary, bonus, equity, benefits,
 * currency, pay period) and until now had zero cross-application view —
 * CompareOffersUseCase only compares offers within a single application.
 * This shows every offer ever logged as a chronological trend, plus
 * min/max/median/average stats grouped by currency (no FX conversion is
 * attempted, so offers in different currencies are never mixed together).
 * Fetches independently and degrades silently on error, same as the other
 * analytics panels — this is a supplementary insight, not critical path.
 */
export function OfferAnalyticsPanel() {
  const { t } = useLocale();
  const dates = useDates();
  const { data, isLoading } = useQuery(offerAnalyticsQueryOptions);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const analytics = data?.offerAnalytics;
  if (!analytics) return null;

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-medium text-stone-700 dark:text-stone-300">
        {t('offerAnalytics.title')}
      </h2>
      <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">
        {t('offerAnalytics.description')}
      </p>

      {analytics.byCurrency.length === 0 ? (
        <EmptyState size="compact" className="py-8" message={t('offerAnalytics.emptyMessage')} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {analytics.byCurrency.map((stat) => (
              <div key={stat.currency}>
                <p className="mb-1 text-xs text-stone-400 dark:text-stone-500">
                  {t('offerAnalytics.medianLabel', { currency: stat.currency, count: stat.count })}
                </p>
                <p className="text-lg font-medium text-stone-900 dark:text-stone-100">
                  {formatCurrency(stat.medianYearlySalary, stat.currency)}
                </p>
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  {formatCurrency(stat.minYearlySalary, stat.currency)} –{' '}
                  {formatCurrency(stat.maxYearlySalary, stat.currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {analytics.trend.map((point) => (
              <div
                key={point.offerId}
                className="flex items-center gap-3 border-b border-stone-100 py-2 last:border-0 dark:border-stone-700"
              >
                <span className="w-24 shrink-0 text-xs text-stone-400 dark:text-stone-500">
                  {dates.day(point.createdAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-900 dark:text-stone-100">
                  {point.company}
                  <span className="text-stone-400 dark:text-stone-500"> · {point.role}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-stone-700 dark:text-stone-300">
                  {formatCurrency(point.normalizedYearlySalary, point.currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
