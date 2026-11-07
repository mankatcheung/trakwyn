import { Link } from '@tanstack/react-router';
import { useBillingStatus, usageLevel } from '#/lib/billingStatus';
import { useLocale } from '#/lib/i18n';

/**
 * A quiet heads-up on the applications list while the user is between 80% of
 * their application limit and the cap (JEF-523). It never blocks anything: at
 * the cap the new-application form already answers with its own prompt. The
 * numbers come from `billingStatus`, so no limit is copied into the app.
 */
export function ApplicationCapNotice() {
  const { t } = useLocale();
  const status = useBillingStatus();
  if (!status || !status.enforced) return null;

  const limit = status.limits.applications;
  const used = status.usage.applications;
  if (limit === null || usageLevel(used, limit) !== 'warning') return null;

  return (
    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
      {t('applications.capNotice', { used, limit })}{' '}
      <Link to="/settings/plan" className="font-medium underline">
        {t('plan.seePlans')}
      </Link>
    </p>
  );
}
