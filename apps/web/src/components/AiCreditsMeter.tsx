import { useLocale } from '#/lib/i18n';
import { aiCreditsView, isLowOnCredits } from '#/lib/aiCredits';
import { useBillingStatus } from '#/lib/billingStatus';

interface AiCreditsMeterProps {
  /** `full` is the settings meter with a bar; `hint` is the one-line assistant note, shown only when low. */
  variant?: 'full' | 'hint' | 'inline';
  className?: string;
}

function formatResetDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
  });
}

const BAR_COLOUR = { ok: 'bg-blue-600', warning: 'bg-amber-500', empty: 'bg-red-500' } as const;

/**
 * How many hosted AI credits are left this month (JEF-451). A number, not a
 * percentage ("12 of 30 left"). Always shown in settings; in the assistant
 * only below 30%. Renders nothing while loading or when the API sent none.
 */
export function AiCreditsMeter({ variant = 'full', className }: AiCreditsMeterProps) {
  const { t, locale } = useLocale();
  const status = useBillingStatus();
  const view = aiCreditsView(status?.aiCredits);
  if (!view) return null;
  if (variant === 'hint' && !isLowOnCredits(view)) return null;

  const text = t('aiCredits.left', { left: view.left, total: view.total });
  const resets = t('aiCredits.resets', { date: formatResetDate(view.resetsAt, locale) });

  // A compact, always-visible line next to an AI action (JEF-506).
  if (variant === 'inline') {
    const tone =
      view.level === 'empty'
        ? 'text-red-600 dark:text-red-400'
        : view.level === 'warning'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-gray-500 dark:text-gray-400';
    return (
      <p className={`text-xs ${tone} ${className ?? ''}`.trim()} role="status" title={resets}>
        {text}
      </p>
    );
  }

  if (variant === 'hint') {
    return (
      <p className={className ?? 'text-xs text-gray-500 dark:text-gray-400'} role="status">
        {text} · {resets}
      </p>
    );
  }

  const percent =
    view.total === 0 ? 100 : Math.round(((view.total - view.left) / view.total) * 100);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900 dark:text-gray-100" title={t('aiCredits.hover')}>
          {text}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{resets}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('aiCredits.title')}
        aria-valuemin={0}
        aria-valuemax={view.total}
        aria-valuenow={view.total - view.left}
        className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div className={`h-full ${BAR_COLOUR[view.level]}`} style={{ width: `${percent}%` }} />
      </div>
      {view.level === 'warning' && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t('aiCredits.warning')}</p>
      )}
    </div>
  );
}
