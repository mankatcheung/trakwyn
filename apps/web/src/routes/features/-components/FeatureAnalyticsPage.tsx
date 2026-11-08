import { BarChart3, Bell } from 'lucide-react';
import { FeaturePageLayout } from '#/components/marketing/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/components/marketing/ThemedScreenshot';

export function FeatureAnalyticsPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={BarChart3}
      eyebrowLabel={t('features.analytics.eyebrow')}
      title={t('features.analytics.title')}
      description={t('features.analytics.description')}
      heroVisual={<ThemedScreenshot name="analytics" />}
      benefits={[
        {
          title: t('features.analytics.benefit1.title'),
          description: t('features.analytics.benefit1.description'),
          visual: (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:divide-gray-700 dark:border-gray-800 dark:bg-gray-800/50">
              {(
                [
                  ['status.applied', 21],
                  ['status.interviewing', 9],
                  ['status.offered', 3],
                ] as const
              ).map(([statusKey, value]) => (
                <div key={statusKey} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{t(statusKey)}</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">{value}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          title: t('features.analytics.benefit2.title'),
          description: t('features.analytics.benefit2.description'),
          visual: (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-900 dark:bg-orange-900/20">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700 dark:text-orange-400">
                <Bell className="size-3.5" />
                {t('features.analytics.ghostedBadge')}
              </div>
              <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {t('features.analytics.ghostedExample')}
              </div>
            </div>
          ),
        },
        {
          title: t('features.analytics.benefit3.title'),
          description: t('features.analytics.benefit3.description'),
          visual: (
            <div className="space-y-2.5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              {(
                [
                  ['features.analytics.channelReferral', 82],
                  ['features.analytics.channelDirect', 54],
                  ['features.analytics.channelJobBoard', 28],
                ] as const
              ).map(([channelKey, pct]) => (
                <div key={channelKey} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {t(channelKey)}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-gray-100 dark:bg-gray-700">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ),
        },
      ]}
      ctaHeadline={t('features.analytics.ctaHeadline')}
    />
  );
}
