import { Link } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

interface UpgradePromptProps {
  /** What the API said: it names the feature, or the Free allowance, that needs Pro. */
  message: string;
  className?: string;
}

/**
 * The inline answer to `PLAN_REQUIRED` (JEF-344): what needs Pro, and where to
 * see what Pro includes. It is not an error colour, because the user did
 * nothing wrong. Buying Pro arrives with billing (JEF-426); until then the
 * link goes to the plan page, which already compares the plans.
 */
export function UpgradePrompt({ message, className }: UpgradePromptProps) {
  const { t } = useLocale();

  return (
    <div
      role="status"
      className={[
        'flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <LockIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        {message}{' '}
        <Link to="/settings/plan" className="font-medium underline">
          {t('plan.seePlans')}
        </Link>
      </p>
    </div>
  );
}
