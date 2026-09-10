import React, { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAllOffers, useCompareOffers } from '../hooks/useOfferQueries';
import { CheckIcon } from '../components/OfferIcons';
import { formatSalary } from '../lib/formatSalary';
import { getErrorMessage } from '../../../lib/errors';
import type { OfferComparison } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';

export function AllOffersScreen() {
  const { t } = useTranslation('offers');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resolvedLanguage } = useLanguage();
  const { data: offers, isLoading } = useAllOffers();
  const compareOffers = useCompareOffers();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<OfferComparison[]>([]);
  const [error, setError] = useState<string | null>(null);

  const items = offers ?? [];

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : items.map((entry) => entry.offer.id));
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>{t('noOffersToCompare')}</Text>
      ) : (
        <>
          <View style={styles.hintRow}>
            <Text style={styles.hint}>{t('selectHint')}</Text>
            <Pressable onPress={toggleSelectAll} testID="select-all-offers">
              <Text style={styles.selectAllText}>
                {allSelected ? t('deselectAll') : t('selectAll')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.optionsGrid}>
            {items.map(({ offer, company, role }) => {
              const selected = selectedIds.includes(offer.id);
              return (
                <Pressable
                  key={offer.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => toggleSelection(offer.id)}
                  testID={`compare-offer-option-${offer.id}`}
                >
                  <View style={styles.optionBody}>
                    <Text style={styles.optionCompany}>
                      {company} — {role}
                    </Text>
                    <Text style={styles.optionSalary}>
                      {formatSalary(
                        offer.baseSalary,
                        offer.currency,
                        offer.period,
                        resolvedLanguage,
                      )}
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
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <CheckIcon color={colors.onPrimary} size={13} /> : null}
                  </View>
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
              <ActivityIndicator color={colors.onPrimary} />
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
                <View style={styles.resultHeaderLeft}>
                  <Text style={styles.resultCompany}>{comp.company}</Text>
                  {index === 0 ? (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>{t('bestBadge')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.resultTotal}>
                  {formatSalary(comp.totalCompensation, 'USD', undefined, resolvedLanguage)}
                </Text>
              </View>
              <Text style={styles.resultRole}>{comp.role}</Text>
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>{t('baseNormalizedLabel')}</Text>
                <Text style={styles.resultRowValue}>
                  {formatSalary(comp.normalizedYearlySalary, 'USD', undefined, resolvedLanguage)}
                </Text>
              </View>
              {comp.offer.equity ? (
                <View style={styles.resultRow}>
                  <Text style={styles.resultRowLabel}>{t('equityFieldLabel')}</Text>
                  <Text style={styles.resultRowValue}>{comp.offer.equity}</Text>
                </View>
              ) : null}
              {comp.offer.benefits ? (
                <View style={styles.resultRow}>
                  <Text style={styles.resultRowLabel}>{t('benefitsFieldLabel')}</Text>
                  <Text style={styles.resultRowValue}>{comp.offer.benefits}</Text>
                </View>
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
    hintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hint: { fontSize: 14, color: colors.textSubtle },
    selectAllText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    emptyText: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },
    optionsGrid: { gap: 10 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 16,
    },
    optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
    optionBody: { flex: 1 },
    optionCompany: { fontSize: 13, color: colors.textSubtle, marginBottom: 2 },
    optionSalary: { fontSize: 17, fontWeight: '700', color: colors.text },
    optionMeta: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    compareButton: {
      minHeight: 52,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compareButtonDisabled: { opacity: 0.6 },
    compareButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    resultCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 2,
    },
    resultCardBest: { borderColor: colors.successBorder, backgroundColor: colors.successSurface },
    resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    resultCompany: { fontSize: 16, fontWeight: '700', color: colors.text },
    bestBadge: {
      backgroundColor: colors.success,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    bestBadgeText: { fontSize: 11, fontWeight: '700', color: colors.onSuccess },
    resultTotal: { fontSize: 20, fontWeight: '800', color: colors.text },
    resultRole: { fontSize: 13, color: colors.textSubtle, marginBottom: 4 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    resultRowLabel: { fontSize: 13, color: colors.textSubtle },
    resultRowValue: { fontSize: 13, color: colors.text, fontWeight: '600' },
  });
}
