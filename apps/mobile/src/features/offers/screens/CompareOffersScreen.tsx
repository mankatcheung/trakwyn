import React, { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCompareOffers, useOffers } from '../hooks/useOfferQueries';
import { formatSalary } from '../lib/formatSalary';
import { getErrorMessage } from '../../../lib/errors';
import type { OfferComparison } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';

export function CompareOffersScreen() {
  const { t } = useTranslation('offers');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resolvedLanguage } = useLanguage();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: offers, isLoading } = useOffers(applicationId);
  const compareOffers = useCompareOffers();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<OfferComparison[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const onCompare = async () => {
    if (selectedIds.length < 2) return;
    setError(null);
    try {
      const result = await compareOffers.mutateAsync(selectedIds);
      setComparisons(result);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const items = offers ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('compareOffersTitle')}</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>{t('noOffersToCompare')}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t('selectHint')}</Text>
          <View style={styles.optionsGrid}>
            {items.map((offer) => {
              const selected = selectedIds.includes(offer.id);
              return (
                <Pressable
                  key={offer.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => toggleSelection(offer.id)}
                  testID={`compare-offer-option-${offer.id}`}
                >
                  <Text style={styles.optionSalary}>
                    {formatSalary(offer.baseSalary, offer.currency, offer.period, resolvedLanguage)}
                  </Text>
                  {offer.bonus ? (
                    <Text style={styles.optionMeta}>
                      {t('bonusSuffixCompact', {
                        amount: formatSalary(
                          offer.bonus,
                          offer.currency,
                          undefined,
                          resolvedLanguage,
                        ),
                      })}
                    </Text>
                  ) : null}
                  {selected && <Text style={styles.checkmark}>{t('selected')}</Text>}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[
              styles.compareButton,
              (selectedIds.length < 2 || compareOffers.isPending) && styles.compareButtonDisabled,
            ]}
            onPress={onCompare}
            disabled={selectedIds.length < 2 || compareOffers.isPending}
            testID="run-compare-button"
          >
            {compareOffers.isPending ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.compareButtonText}>
                {t('compareCount', { count: selectedIds.length })}
              </Text>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {comparisons.map((comp, index) => (
            <View
              key={comp.offer.id}
              style={[styles.resultCard, index === 0 && styles.resultCardBest]}
              testID={`comparison-result-${comp.offer.id}`}
            >
              <View style={styles.resultHeader}>
                <Text style={styles.resultCompany}>
                  {comp.company}
                  {index === 0 ? t('bestSuffix') : ''}
                </Text>
                <Text style={styles.resultTotal}>
                  {formatSalary(comp.totalCompensation, 'USD', undefined, resolvedLanguage)}
                </Text>
              </View>
              <Text style={styles.resultRole}>{comp.role}</Text>
              <Text style={styles.resultMeta}>
                {t('baseNormalizedLabel', {
                  amount: formatSalary(
                    comp.normalizedYearlySalary,
                    'USD',
                    undefined,
                    resolvedLanguage,
                  ),
                })}
              </Text>
              {comp.offer.equity ? (
                <Text style={styles.resultMeta}>
                  {t('equityLabel', { value: comp.offer.equity })}
                </Text>
              ) : null}
              {comp.offer.benefits ? (
                <Text style={styles.resultMeta}>
                  {t('benefitsLabel', { value: comp.offer.benefits })}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    hint: { fontSize: 13, color: colors.textSubtle },
    emptyText: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },
    optionsGrid: { gap: 10 },
    option: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
    optionSalary: { fontSize: 15, fontWeight: '700', color: colors.text },
    optionMeta: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    checkmark: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 4 },
    compareButton: {
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compareButtonDisabled: { opacity: 0.6 },
    compareButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    resultCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 2,
    },
    resultCardBest: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
    resultHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    resultCompany: { fontSize: 14, fontWeight: '700', color: colors.text },
    resultTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
    resultRole: { fontSize: 12, color: colors.textSubtle },
    resultMeta: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
  });
}
