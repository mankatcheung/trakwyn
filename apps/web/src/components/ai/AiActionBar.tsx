import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import type { AiFeature } from '#/lib/billingStatus';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { AiCreditCost } from './AiCreditCost';
import { useAiCredits } from './hooks/useAiCredits';

interface AiActionBarProps {
  feature: AiFeature;
  /** Runs the action. The credits are re-read once it settles, whatever the outcome. */
  onRun: () => Promise<unknown> | void;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** The prompt box, or anything else that belongs above the button. */
  children?: ReactNode;
}

/**
 * The run button of an AI action with what surrounds it: cost, credits left,
 * and the two states where it cannot run — no AI set up, and credits spent
 * (JEF-506). Nothing about credits shows for a user on their own key.
 */
export function AiActionBar({
  feature,
  onRun,
  label,
  disabled,
  loading,
  loadingLabel,
  children,
}: AiActionBarProps) {
  const { t } = useLocale();
  const { onTrakwynAi, needsSetup, canAfford, refresh } = useAiCredits();
  const exhausted = onTrakwynAi && !canAfford(feature);

  const run = async () => {
    try {
      await onRun();
    } catch {
      // `onRun` owns showing its failure (it knows the error's code); a rejection
      // reaching here must not become an unhandled one, and credits refresh below.
    } finally {
      void refresh();
    }
  };

  if (needsSetup) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-700 dark:text-gray-300">{t('aiHelper.setupHelp')}</p>
        <Link
          to="/settings/ai"
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('aiHelper.setupAction')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {children}
      <Button
        type="button"
        fullWidth
        onClick={() => void run()}
        disabled={disabled || loading || exhausted}
      >
        {loading ? (loadingLabel ?? label) : label}
      </Button>
      {exhausted ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {t('aiHelper.exhausted')}{' '}
          <Link to="/settings/ai" className="font-medium underline">
            {t('aiHelper.exhaustedLink')}
          </Link>
        </p>
      ) : (
        <AiCreditCost feature={feature} />
      )}
      {onTrakwynAi && <AiCreditsMeter variant="inline" />}
    </div>
  );
}
