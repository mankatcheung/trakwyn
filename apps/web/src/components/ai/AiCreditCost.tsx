import { useLocale } from '#/lib/i18n';
import type { AiFeature } from '#/lib/billingStatus';
import { useAiCredits } from './hooks/useAiCredits';

interface AiCreditCostProps {
  feature: AiFeature;
  className?: string;
}

/** "Uses N credits". Nothing for a user on their own key, or while the cost is unknown. */
export function AiCreditCost({ feature, className }: AiCreditCostProps) {
  const { t } = useLocale();
  const { onTrakwynAi, costOf } = useAiCredits();
  const cost = costOf(feature);
  if (!onTrakwynAi || cost === null) return null;
  return (
    <p className={className ?? 'text-xs text-gray-500 dark:text-gray-400'}>
      {t(cost === 1 ? 'aiHelper.costOne' : 'aiHelper.costMany', { count: cost })}
    </p>
  );
}
