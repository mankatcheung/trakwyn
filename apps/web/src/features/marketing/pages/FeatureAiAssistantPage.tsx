import { MessageSquareText } from 'lucide-react';
import { FeaturePageLayout } from '#/features/marketing/components/FeaturePageLayout';
import { useLocale } from '#/lib/i18n';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';

export function FeatureAiAssistantPage() {
  const { t } = useLocale();
  return (
    <FeaturePageLayout
      eyebrowIcon={MessageSquareText}
      eyebrowLabel={t('features.aiAssistant.eyebrow')}
      title={t('features.aiAssistant.title')}
      description={t('features.aiAssistant.description')}
      heroVisual={<ThemedScreenshot name="assistant" priority />}
      heroVisualMaxWidth="max-w-2xl"
      benefits={[
        {
          title: t('features.aiAssistant.benefit1.title'),
          description: t('features.aiAssistant.benefit1.description'),
          visual: <ThemedScreenshot name="crop-assistant-suggestions" />,
        },
        {
          title: t('features.aiAssistant.benefit2.title'),
          description: t('features.aiAssistant.benefit2.description'),
          visual: <ThemedScreenshot name="crop-ai-providers" />,
        },
        {
          title: t('features.aiAssistant.benefit3.title'),
          description: t('features.aiAssistant.benefit3.description'),
          visual: <ThemedScreenshot name="crop-chat-history" />,
        },
      ]}
      ctaHeadline={t('features.aiAssistant.ctaHeadline')}
    />
  );
}
