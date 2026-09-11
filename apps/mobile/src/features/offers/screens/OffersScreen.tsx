import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDeleteOffer, useOffers } from '../hooks/useOfferQueries';
import { PencilIcon, TrashIcon } from '../components/OfferIcons';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { formatSalary } from '../lib/formatSalary';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';

export function OffersScreen() {
  const { t } = useTranslation('offers');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resolvedLanguage } = useLanguage();
  const router = useRouter();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: offers, isLoading, isError, error } = useOffers(applicationId);
  const deleteOffer = useDeleteOffer(applicationId);

  const items = offers ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : isError ? (
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>{t('emptyText')}</Text>
      ) : (
        items.map((offer) => (
          <View key={offer.id} style={styles.offerCard} testID={`offer-${offer.id}`}>
            <View style={styles.offerCardHeader}>
              <View style={styles.offerCardBody}>
                <Text style={styles.offerSalary}>
                  {formatSalary(offer.baseSalary, offer.currency, offer.period, resolvedLanguage)}
                </Text>
                {offer.bonus ? (
                  <Text style={styles.offerMeta}>
                    {t('bonusSuffix', {
                      amount: formatSalary(
                        offer.bonus,
                        offer.currency,
                        offer.period,
                        resolvedLanguage,
                      ),
                    })}
                  </Text>
                ) : null}
                {offer.equity ? (
                  <Text style={styles.offerMeta}>{t('equityLabel', { value: offer.equity })}</Text>
                ) : null}
                {offer.benefits ? (
                  <Text style={styles.offerMeta}>
                    {t('benefitsLabel', { value: offer.benefits })}
                  </Text>
                ) : null}
                {offer.notes ? <Text style={styles.offerNotes}>{offer.notes}</Text> : null}
              </View>
              <View style={styles.offerActions}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() =>
                    router.push(`/applications/${applicationId}/offers/${offer.id}/edit`)
                  }
                  hitSlop={8}
                  testID={`edit-offer-${offer.id}`}
                >
                  <PencilIcon color={colors.textFaint} size={18} />
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => deleteOffer.mutate(offer.id)}
                  hitSlop={8}
                  testID={`delete-offer-${offer.id}`}
                >
                  <TrashIcon color={colors.textFaint} size={18} />
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}

      <FloatingActionButton
        onPress={() => router.push(`/applications/${applicationId}/offers/new`)}
        accessibilityLabel={t('addOffer')}
        testID="add-offer-button"
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 40 },
    loading: { marginTop: 24 },
    emptyText: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    offerCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    offerCardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    offerCardBody: { flex: 1 },
    offerSalary: { fontSize: 24, fontWeight: '800', color: colors.text },
    offerMeta: { fontSize: 15, color: colors.textSubtle, marginTop: 6, lineHeight: 20 },
    offerNotes: { fontSize: 13, color: colors.textFaint, marginTop: 10 },
    offerActions: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    iconButton: { padding: 2 },
  });
}
