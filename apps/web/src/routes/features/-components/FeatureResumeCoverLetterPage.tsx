import { FileText, Check } from 'lucide-react';
import { FeaturePageLayout } from '#/components/marketing/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/components/marketing/ThemedScreenshot';

/** Fictional, like the landing page's sample posting. */
const SAMPLE_COMPANY = 'Northwind Labs';

export function FeatureResumeCoverLetterPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={FileText}
      eyebrowLabel={t('features.resumeCoverLetter.eyebrow')}
      title={t('features.resumeCoverLetter.title')}
      description={t('features.resumeCoverLetter.description')}
      heroVisual={<ThemedScreenshot name="resume" />}
      heroVisualMaxWidth="max-w-3xl"
      benefits={[
        {
          title: t('features.resumeCoverLetter.benefit1.title'),
          description: t('features.resumeCoverLetter.benefit1.description'),
          visual: (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {t('features.resumeCoverLetter.drawnFrom')}
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {[
                  'features.resumeCoverLetter.drawnFromItem1',
                  'features.resumeCoverLetter.drawnFromItem2',
                  'features.resumeCoverLetter.drawnFromItem3',
                ].map((lineKey) => (
                  <div
                    key={lineKey}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <Check className="size-3.5 shrink-0 text-blue-600" />
                    {t(lineKey)}
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          title: t('features.resumeCoverLetter.benefit2.title'),
          description: t('features.resumeCoverLetter.benefit2.description'),
          visual: (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                {t('features.resumeCoverLetter.briefingLabel')}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{SAMPLE_COMPANY}</div>
              <div className="mt-3 space-y-2">
                <div className="h-1.5 w-11/12 rounded-sm bg-gray-200 dark:bg-gray-700" />
                <div className="h-1.5 w-3/4 rounded-sm bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="mt-3 text-xs text-gray-400">
                {t('features.resumeCoverLetter.briefingMeta')}
              </div>
            </div>
          ),
        },
        {
          title: t('features.resumeCoverLetter.benefit3.title'),
          description: t('features.resumeCoverLetter.benefit3.description'),
          visual: (
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 dark:bg-blue-900/30">
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {`v3 · ${SAMPLE_COMPANY}`}
                </span>
                <span className="text-xs font-bold text-green-600">
                  {t('features.resumeCoverLetter.outcomeReplied')}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {`v2 · ${SAMPLE_COMPANY}`}
                </span>
                <span className="text-xs text-gray-400">
                  {t('features.resumeCoverLetter.outcomeNoReply')}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {`v1 · ${SAMPLE_COMPANY}`}
                </span>
                <span className="text-xs text-gray-400">
                  {t('features.resumeCoverLetter.outcomeNoReply')}
                </span>
              </div>
            </div>
          ),
        },
      ]}
      ctaHeadline={t('features.resumeCoverLetter.ctaHeadline')}
    />
  );
}
