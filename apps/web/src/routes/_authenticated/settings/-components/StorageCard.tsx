import { useLocale } from '#/lib/i18n';
import { formatMegabytes, storageLevel, useStorageUsage } from '#/lib/storageUsage';
import { Card, ProgressBar } from '@trakwyn/ui';

const BAR_COLOR = {
  ok: '',
  warning: '[&>div]:bg-amber-500',
  full: '[&>div]:bg-red-600',
} as const;

export function StorageCard() {
  const { t } = useLocale();
  const usage = useStorageUsage();
  if (!usage) return null;

  const level = storageLevel(usage);
  const percent = Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100));

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('storage.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('storage.description')}</p>
      </div>
      <ProgressBar
        value={usage.usedBytes}
        max={usage.limitBytes}
        aria-label={t('storage.title')}
        className={BAR_COLOR[level]}
      />
      <p className="text-sm text-gray-900 dark:text-gray-100">
        {t('storage.usage', {
          used: formatMegabytes(usage.usedBytes),
          limit: formatMegabytes(usage.limitBytes),
          percent,
        })}
      </p>
      {level === 'warning' && (
        <p role="status" className="text-sm text-amber-600">
          {t('storage.warning')}
        </p>
      )}
      {level === 'full' && (
        <p role="alert" className="text-sm text-red-600">
          {t('storage.full')}
        </p>
      )}
    </Card>
  );
}
