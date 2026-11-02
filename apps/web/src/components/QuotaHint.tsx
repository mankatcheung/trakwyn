import { useLocale } from '#/lib/i18n';
import { useQuotaState, type QuotaResource } from '#/lib/contentQuota';

interface QuotaHintProps {
  resource: QuotaResource;
  /** Per-application resources: how many the application holds. Omit for per-user ones. */
  used?: number;
  className?: string;
}

/**
 * "9 of 10 notes" beside a create control (JEF-494). Silent until 80% of the
 * limit, because most users never come near a cap and an always-on counter is
 * noise; at the cap it says what the limit is and how to get room.
 */
export function QuotaHint({ resource, used, className }: QuotaHintProps) {
  const { t } = useLocale();
  const state = useQuotaState(resource, used);
  if (!state || state.level === 'ok') return null;

  const noun = t(`quota.noun.${resource}`);
  if (state.level === 'full') {
    return (
      <p role="alert" className={['text-xs text-red-600', className ?? ''].join(' ').trim()}>
        {t('quota.full', { limit: state.limit, noun })}
      </p>
    );
  }
  return (
    <p className={['text-xs text-amber-600', className ?? ''].join(' ').trim()}>
      {t('quota.usage', { used: state.used, limit: state.limit, noun })}
    </p>
  );
}
