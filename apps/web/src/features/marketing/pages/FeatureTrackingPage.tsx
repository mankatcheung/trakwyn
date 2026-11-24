import { LayoutDashboard } from 'lucide-react';
import { FeaturePageLayout } from '#/features/marketing/components/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';

export function FeatureTrackingPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={LayoutDashboard}
      eyebrowLabel={t('features.tracking.eyebrow')}
      title={t('features.tracking.title')}
      description={t('features.tracking.description')}
      heroVisual={<ThemedScreenshot name="board" priority />}
      benefits={[
        {
          title: t('features.tracking.benefit1.title'),
          description: t('features.tracking.benefit1.description'),
          visual: <ThemedScreenshot name="crop-new-application-import" />,
        },
        {
          title: t('features.tracking.benefit2.title'),
          description: t('features.tracking.benefit2.description'),
          visual: <ThemedScreenshot name="crop-board-header" />,
        },
        {
          title: t('features.tracking.benefit3.title'),
          description: t('features.tracking.benefit3.description'),
          visual: <ThemedScreenshot name="crop-notifications" />,
        },
      ]}
      ctaHeadline={t('features.tracking.ctaHeadline')}
    />
  );
}
