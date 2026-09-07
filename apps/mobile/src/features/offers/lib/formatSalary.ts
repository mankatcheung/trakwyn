import i18n from '../../../i18n';

export function formatSalary(
  amount: number,
  currency: string,
  period?: string,
  locale: string = 'en',
): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
  if (!period) return formatted;
  const suffixKey: Record<string, string> = {
    yearly: 'periodSuffixYearly',
    monthly: 'periodSuffixMonthly',
    weekly: 'periodSuffixWeekly',
  };
  const key = suffixKey[period] ?? 'periodSuffixHourly';
  return `${formatted}${i18n.t(`offers:${key}`)}`;
}
