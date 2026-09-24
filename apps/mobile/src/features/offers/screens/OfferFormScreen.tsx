import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateOffer, useOffers, useUpdateOffer } from '../hooks/useOfferQueries';
import { OfferForm } from '../components/OfferForm';
import { getErrorMessage } from '../../../lib/errors';
import type { OfferFormData } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function OfferFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId, offerId } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const isEditing = Boolean(offerId);

  const { data: offers, isLoading: isLoadingOffers } = useOffers(applicationId);
  const existing = offerId ? (offers?.find((offer) => offer.id === offerId) ?? null) : null;
  const createOffer = useCreateOffer(applicationId);
  const updateOffer = useUpdateOffer(applicationId);

  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (data: OfferFormData) => {
    setError(null);
    try {
      if (isEditing && offerId) {
        await updateOffer.mutateAsync({ offerId, data });
      } else {
        await createOffer.mutateAsync(data);
      }
      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (isEditing && isLoadingOffers) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="offer-form-loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <OfferForm
        initialData={existing}
        onSubmit={onSubmit}
        onCancel={() => router.back()}
        loading={createOffer.isPending || updateOffer.isPending}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 20 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      marginBottom: 4,
    },
  });
}
