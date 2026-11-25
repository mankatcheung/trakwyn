import { Badge } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

/**
 * Marks an answer that began as an AI draft. It stays however the text is edited later.
 * A neutral label with no icon or tint: it says what the text is and does not decorate it
 * (JEF-693).
 */
export function AiGeneratedBadge({ label }: { label?: string }) {
  const { t } = useLocale();
  return <Badge tone="gray">{label ?? t('interviews.aiGenerated')}</Badge>;
}
