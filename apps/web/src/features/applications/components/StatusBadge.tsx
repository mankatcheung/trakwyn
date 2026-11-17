import { Badge } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { statusColor } from '#/features/applications/lib/statusColors';

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  // defaultValue: an unrecognized status (e.g. new data from an API version
  // this build predates) falls back to the raw value instead of leaking the
  // untranslated i18next key ("status.foo") to the user.
  return (
    <Badge tone={statusColor(status).tone} className="capitalize">
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
