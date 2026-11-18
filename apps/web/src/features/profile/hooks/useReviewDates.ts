import { useLocale } from '#/lib/i18n';
import { MONTH } from '../lib/cvImportDrafts';

/** Formats the `YYYY-MM` values of a CV review row the way the profile page shows them. */
export function useReviewDates() {
  const { t, formatDate } = useLocale();

  const month = (value: string): string =>
    MONTH.test(value)
      ? formatDate(new Date(`${value}-01T00:00:00Z`), {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : value;
  const range = (start: string, end: string): string =>
    `${month(start)} – ${end === '' ? t('experience.present') : month(end)}`;

  return { month, range };
}
