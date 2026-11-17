import { Card, Skeleton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

const STAT_PLACEHOLDERS = [0, 1, 2, 3];

/**
 * What the dashboard route shows while its loader runs (JEF-535): the real
 * heading and placeholder blocks where the stats and list will be, so the
 * page has its shape before the data arrives.
 */
export function DashboardPending() {
  const { t } = useLocale();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8" data-testid="dashboard-pending" aria-busy="true">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 sm:mb-8 dark:text-gray-100">
        {t('dashboard.title')}
      </h1>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_PLACEHOLDERS.map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-14 rounded-lg" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
