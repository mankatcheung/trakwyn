import { BarChart3 } from 'lucide-react';
import { FeaturePageLayout } from '#/features/marketing/components/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';

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
          visual: <ThemedScreenshot name="crop-analytics-stats" />,
        },
        {
          title: t('features.analytics.benefit2.title'),
          description: t('features.analytics.benefit2.description'),
          visual: <ThemedScreenshot name="crop-ghosted" />,
        },
        {
          title: t('features.analytics.benefit3.title'),
          description: t('features.analytics.benefit3.description'),
          visual: <ThemedScreenshot name="crop-channels" />,
        },
      ]}
      ctaHeadline={t('features.analytics.ctaHeadline')}
    />
  );
}
