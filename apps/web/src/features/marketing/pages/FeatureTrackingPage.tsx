import { LayoutDashboard, CalendarDays, Bell, FileText } from 'lucide-react';
import { FeaturePageLayout } from '#/features/marketing/components/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';

const SAMPLE_POSTING_URL = 'northwindlabs.com/careers/senior-designer';

export function FeatureTrackingPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={LayoutDashboard}
      eyebrowLabel={t('features.tracking.eyebrow')}
      title={t('features.tracking.title')}
      description={t('features.tracking.description')}
      heroVisual={<ThemedScreenshot name="board" />}
      benefits={[
        {
          title: t('features.tracking.benefit1.title'),
          description: t('features.tracking.benefit1.description'),
          visual: (
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-800/50">
              <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                {t('features.tracking.jobPostingUrl')}
              </div>
              <div className="mt-2 rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-700 dark:border-stone-600 dark:text-stone-300">
                {SAMPLE_POSTING_URL}
              </div>
              <div className="mt-3.5 inline-block rounded-lg bg-blue-800 px-4 py-2 text-xs font-medium text-white">
                {t('features.tracking.addApplication')}
              </div>
            </div>
          ),
        },
        {
          title: t('features.tracking.benefit2.title'),
          description: t('features.tracking.benefit2.description'),
          visual: (
            <div className="flex gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-800/50">
              <div className="flex-1 rounded-lg bg-blue-50 px-2 py-2.5 text-center text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {t('features.tracking.boardLabel')}
              </div>
              <div className="flex-1 rounded-lg px-2 py-2.5 text-center text-xs font-medium text-stone-400">
                {t('features.tracking.listLabel')}
              </div>
            </div>
          ),
        },
        {
          title: t('features.tracking.benefit3.title'),
          description: t('features.tracking.benefit3.description'),
          visual: (
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:divide-stone-700 dark:border-stone-800 dark:bg-stone-800/50">
              <div className="flex items-center gap-2.5 py-2.5 text-sm text-stone-700 dark:text-stone-300">
                <CalendarDays className="size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                {t('features.tracking.reminderInterview')}
              </div>
              <div className="flex items-center gap-2.5 py-2.5 text-sm text-stone-700 dark:text-stone-300">
                <Bell className="size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                {t('features.tracking.reminderFollowUp')}
              </div>
              <div className="flex items-center gap-2.5 py-2.5 text-sm text-stone-700 dark:text-stone-300">
                <FileText className="size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                {t('features.tracking.reminderDocument')}
              </div>
            </div>
          ),
        },
      ]}
      ctaHeadline={t('features.tracking.ctaHeadline')}
    />
  );
}
