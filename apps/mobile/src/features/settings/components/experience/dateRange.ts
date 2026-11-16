import i18n from '../../../../i18n';

/** `2024-01-15 – Present`, from the API's ISO strings. */
export function dateRange(start: string, end: string | null): string {
  return `${start.slice(0, 10)} – ${end ? end.slice(0, 10) : i18n.t('settings:experience.present')}`;
}
