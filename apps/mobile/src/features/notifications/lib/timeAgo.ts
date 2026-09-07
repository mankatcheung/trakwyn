import i18n from '../../../i18n';

export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return i18n.t('notifications:justNow');
  if (minutes < 60) return i18n.t('notifications:minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('notifications:hoursAgo', { count: hours });
  return i18n.t('notifications:daysAgo', { count: Math.floor(hours / 24) });
}
