import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOfferAnalytics } from '../hooks/useAnalyticsQueries';
import { AnalyticsCard } from './AnalyticsCard';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';

function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function OfferAnalyticsSection() {
  const { t } = useTranslation('analytics');
  const { resolvedLanguage } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useOfferAnalytics();

  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (!data) return null;

  return (
    <AnalyticsCard
      title={t('cards.offers')}
      description={t('cards.offersDescription')}
      testID="offer-analytics-section"
    >
      {data.byCurrency.length === 0 ? (
        <Text style={styles.empty}>{t('noOffersLogged')}</Text>
      ) : (
        <>
          <View style={styles.currencyGrid}>
            {data.byCurrency.map((stat) => (
              <View
                key={stat.currency}
                style={styles.currencyCol}
                testID={`offer-currency-${stat.currency}`}
              >
                <Text style={styles.currencyLabel}>
                  {t('medianCurrency', { currency: stat.currency, count: stat.count })}
                </Text>
                <Text style={styles.currencyValue}>
                  {formatCurrency(stat.medianYearlySalary, stat.currency, resolvedLanguage)}
                </Text>
                <Text style={styles.currencyRange}>
                  {formatCurrency(stat.minYearlySalary, stat.currency, resolvedLanguage)} –{' '}
                  {formatCurrency(stat.maxYearlySalary, stat.currency, resolvedLanguage)}
                </Text>
              </View>
            ))}
          </View>

          {data.trend.map((point) => (
            <View
              key={point.offerId}
              style={styles.trendRow}
              testID={`offer-trend-${point.offerId}`}
            >
              <Text style={styles.trendDate}>{formatDate(point.createdAt, resolvedLanguage)}</Text>
              <Text style={styles.trendCompany} numberOfLines={1}>
                {point.company} · {point.role}
              </Text>
              <Text style={styles.trendSalary}>
                {formatCurrency(point.normalizedYearlySalary, point.currency, resolvedLanguage)}
              </Text>
            </View>
          ))}
        </>
      )}
    </AnalyticsCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    empty: { fontSize: 12, color: colors.textFaint },
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    currencyCol: { minWidth: 120, gap: 2 },
    currencyLabel: { fontSize: 10, color: colors.textFaint },
    currencyValue: { fontSize: 15, fontWeight: '700', color: colors.text },
    currencyRange: { fontSize: 10, color: colors.textFaint },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceAlt,
      paddingTop: 6,
    },
    trendDate: { width: 52, fontSize: 10, color: colors.textFaint },
    trendCompany: { flex: 1, fontSize: 12, color: colors.text },
    trendSalary: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  });
}
