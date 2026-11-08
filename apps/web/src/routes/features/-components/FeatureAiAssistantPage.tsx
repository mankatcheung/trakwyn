import { Sparkles, Check } from 'lucide-react';
import { FeaturePageLayout } from '#/components/marketing/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/components/marketing/ThemedScreenshot';

/** A provider name, not translated. */
const PROVIDER_OPENAI = 'OpenAI';

export function FeatureAiAssistantPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={Sparkles}
      eyebrowLabel={t('features.aiAssistant.eyebrow')}
      title={t('features.aiAssistant.title')}
      description={t('features.aiAssistant.description')}
      heroVisual={<ThemedScreenshot name="assistant" />}
      heroVisualMaxWidth="max-w-2xl"
      benefits={[
        {
          title: t('features.aiAssistant.benefit1.title'),
          description: t('features.aiAssistant.benefit1.description'),
          visual: (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {t('features.aiAssistant.canSeeLabel')}
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {[
                  'features.aiAssistant.canSeeItem1',
                  'features.aiAssistant.canSeeItem2',
                  'features.aiAssistant.canSeeItem3',
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
          title: t('features.aiAssistant.benefit2.title'),
          description: t('features.aiAssistant.benefit2.description'),
          visual: (
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {t('features.aiAssistant.keyConnected')}
              </div>
              <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                {PROVIDER_OPENAI}
              </div>
              <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-400 dark:border-gray-700">
                {t('features.aiAssistant.providerCustom')}
              </div>
            </div>
          ),
        },
        {
          title: t('features.aiAssistant.benefit3.title'),
          description: t('features.aiAssistant.benefit3.description'),
          visual: (
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
              <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {t('features.aiAssistant.historyItem1')}
              </div>
              <div className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                {t('features.aiAssistant.historyItem2')}
              </div>
              <div className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                {t('features.aiAssistant.historyItem3')}
              </div>
            </div>
          ),
        },
      ]}
      ctaHeadline={t('features.aiAssistant.ctaHeadline')}
    />
  );
}
