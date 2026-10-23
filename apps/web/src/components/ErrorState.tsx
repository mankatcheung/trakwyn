import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { UpgradePrompt } from '#/components/UpgradePrompt';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode, PLAN_REQUIRED_CODE } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { Button } from '@trakwyn/ui';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/**
 * Page/section-level failed-to-load state — mirrors the visual weight of the
 * existing "No X yet" empty states (same icon size/opacity/spacing
 * convention) but in red, with a retry action, so a failed fetch reads as
 * distinctly different from a genuinely empty result.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { t } = useLocale();

  // A feature this plan does not include is not a failure, and trying again
  // changes nothing, so it gets the upgrade prompt rather than a retry.
  if (getGqlErrorCode(error) === PLAN_REQUIRED_CODE) {
    return (
      <div className="mx-auto max-w-md py-12">
        <UpgradePrompt message={getErrorMessage(error)} />
      </div>
    );
  }

  return (
    <div className="py-12 text-center">
      <AlertTriangleIcon size={40} className="mx-auto mb-3 text-red-500" />
      <p className="text-gray-700 dark:text-gray-300">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button
          variant="link"
          onClick={onRetry}
          aria-label={t('common.tryAgain')}
          className="mx-auto mt-3"
        >
          <span className="flex items-center gap-1.5">
            <RefreshCwIcon size={14} />{' '}
            <span className="hidden sm:inline">{t('common.tryAgain')}</span>
          </span>
        </Button>
      )}
    </div>
  );
}
