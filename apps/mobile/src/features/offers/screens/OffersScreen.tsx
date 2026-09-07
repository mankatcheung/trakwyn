import React, { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useCreateOffer,
  useDeleteOffer,
  useOffers,
  useUpdateOffer,
} from '../hooks/useOfferQueries';
import { OfferForm } from '../components/OfferForm';
import { formatSalary } from '../lib/formatSalary';
import { getErrorMessage } from '../../../lib/errors';
import type { Offer, OfferFormData } from '../types';
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
  const createOffer = useCreateOffer(applicationId);
  const updateOffer = useUpdateOffer(applicationId);
  const deleteOffer = useDeleteOffer(applicationId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingOffer(null);
    setFormOpen(true);
  };

  const openEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormOpen(true);
  };

  const onSave = async (data: OfferFormData) => {
    setSaveError(null);
    try {
      if (editingOffer) {
        await updateOffer.mutateAsync({ offerId: editingOffer.id, data });
      } else {
        await createOffer.mutateAsync(data);
      }
      setFormOpen(false);
      setEditingOffer(null);
    } catch (err) {
      setSaveError(getErrorMessage(err));
    }
  };

  const items = offers ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('title')}</Text>
        <View style={styles.headerActions}>
          {items.length >= 2 && (
            <Pressable onPress={() => router.push('./compare')} testID="compare-offers-button">
              <Text style={styles.link}>{t('compare')}</Text>
            </Pressable>
          )}
          {!formOpen && (
            <Pressable onPress={openCreate} testID="add-offer-button">
              <Text style={styles.link}>{t('addOffer')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {formOpen && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingOffer ? t('editOfferTitle') : t('newOfferTitle')}
          </Text>
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          <OfferForm
            initialData={editingOffer}
            onSubmit={onSave}
            onCancel={() => {
              setFormOpen(false);
              setEditingOffer(null);
            }}
            loading={createOffer.isPending || updateOffer.isPending}
          />
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : isError ? (
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      ) : items.length === 0 && !formOpen ? (
        <Text style={styles.emptyText}>{t('emptyText')}</Text>
      ) : (
        items.map((offer) => (
          <View key={offer.id} style={styles.offerCard} testID={`offer-${offer.id}`}>
            <View style={styles.offerCardHeader}>
              <View>
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
                <Pressable onPress={() => openEdit(offer)} testID={`edit-offer-${offer.id}`}>
                  <Text style={styles.link}>{t('edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteOffer.mutate(offer.id)}
                  testID={`delete-offer-${offer.id}`}
                >
                  <Text style={styles.linkDanger}>{t('delete')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    headerActions: { flexDirection: 'row', gap: 16 },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 4,
    },
    formTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    offerCardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    offerSalary: { fontSize: 17, fontWeight: '700', color: colors.text },
    offerMeta: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
    offerNotes: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
    offerActions: { gap: 8, alignItems: 'flex-end' },
  });
}
