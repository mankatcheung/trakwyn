import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../lib/errors';
import { StepUpCancelledError, useStepUpReauth } from '../../../auth/useStepUpReauth';
import { useEmailVerification } from '../../verification/hooks/useEmailVerification';
import { useRequestAccountDeletion } from '../hooks/useRequestAccountDeletion';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/**
 * Account deletion, on its own screen rather than bundled with Export/Import
 * (JEF-204's reasoning, ported from apps/web), so it isn't reachable by
 * accident.
 *
 * Since JEF-463 this only starts it, the same as the web: type the account's
 * email, step up if the session is stale (password, Google or a mailed code),
 * and the API mails a link. The link schedules the deletion two weeks out.
 */
export function DangerZoneScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const requestDeletion = useRequestAccountDeletion();
  const { withStepUp, dialog } = useStepUpReauth();
  const { data: account } = useEmailVerification();
  const email = account?.email ?? '';

  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const matches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const onRequest = async () => {
    setError(null);
    try {
      await withStepUp(() => requestDeletion.mutateAsync());
      setSent(true);
    } catch (err) {
      if (err instanceof StepUpCancelledError) return;
      setError(getErrorMessage(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('danger.title')}</Text>
        <Text style={styles.description}>{t('danger.description')}</Text>

        {sent ? (
          <Text style={styles.success} testID="delete-account-request-sent">
            {t('danger.requestSent', { email })}
          </Text>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.fieldLabel}>{t('danger.confirmEmailLabel', { email })}</Text>
            <TextInput
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={typed}
              onChangeText={setTyped}
              placeholder={email}
              testID="delete-account-email-input"
            />

            <Pressable
              style={[
                styles.deleteButton,
                (!matches || requestDeletion.isPending) && styles.deleteButtonDisabled,
              ]}
              onPress={() => void onRequest()}
              disabled={!matches || requestDeletion.isPending}
              testID="delete-account-button"
            >
              {requestDeletion.isPending ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.deleteButtonText}>{t('danger.deleteMyAccount')}</Text>
              )}
            </Pressable>
          </>
        )}
      </View>

      {dialog}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20 },
    card: {
      backgroundColor: colors.dangerSurface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      padding: 16,
      gap: 12,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.danger },
    description: { fontSize: 13, color: colors.danger },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    error: {
      color: colors.danger,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    success: {
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    deleteButton: {
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      marginTop: 4,
    },
    deleteButtonDisabled: { opacity: 0.6 },
    deleteButtonText: { color: colors.onDanger, fontSize: 14, fontWeight: '600' },
  });
}
