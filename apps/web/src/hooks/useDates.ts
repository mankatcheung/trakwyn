import { useLocale } from '#/lib/i18n';
import { formatDateTime, formatDay, formatTime, type DateInput } from '#/lib/dates';

/** The date styles of `lib/dates.ts`, in the UI's language (JEF-693). */
export function useDates() {
  const { locale } = useLocale();
  return {
    day: (value: DateInput) => formatDay(value, locale),
    dateTime: (value: DateInput) => formatDateTime(value, locale),
    time: (value: DateInput) => formatTime(value, locale),
  };
}
