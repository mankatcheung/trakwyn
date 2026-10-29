import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/AuthContext';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useCancelAccountDeletion } from '../hooks/useEmailVerification';

/**
 * What a signed-in account scheduled for deletion gets in place of the app
 * (JEF-463), the same way `VerifyEmailRequiredScreen` stands in for an
 * unverified one: the date, cancel, or sign out. Signing in never cancels on
 * its own; the owner chooses.
 */
export function AccountDeletionScheduledScreen({
  deletionScheduledAt,
}: {
  deletionScheduledAt: string;
}) {
  const { t, i18n } = useTranslation('auth');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();
  const cancel = useCancelAccountDeletion();
  const [error, setError] = useState<string | null>(null);

  const date = new Date(deletionScheduledAt).toLocaleDateString(i18n.language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const onCancel = async () => {
    setError(null);
    try {
      await cancel.mutateAsync();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.container} testID="account-deletion-scheduled">
      <View style={styles.card}>
        <Text style={styles.title}>{t('deletionScheduled.title')}</Text>
        <Text style={styles.body}>{t('deletionScheduled.body', { date })}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primaryButton, cancel.isPending && styles.disabled]}
          onPress={() => void onCancel()}
          disabled={cancel.isPending}
          testID="cancel-account-deletion-button"
        >
          {cancel.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryText}>{t('deletionScheduled.cancel')}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void logout()}
          disabled={cancel.isPending}
          testID="account-deletion-sign-out-button"
        >
          <Text style={styles.secondaryText}>{t('deletionScheduled.signOut')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      padding: 24,
    },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 14 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, color: colors.textSubtle, lineHeight: 21 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    primaryButton: {
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    disabled: { opacity: 0.6 },
  });
}
