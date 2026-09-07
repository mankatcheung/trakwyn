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
import { useAuth } from '../../../auth/AuthContext';
import { getErrorMessage } from '../../../lib/errors';
import { useDeleteAccount } from '../hooks/useDeleteAccount';
import { STEP_UP_CANCELLED, useStepUpReauth } from '../hooks/useStepUpReauth';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/**
 * Account deletion, on its own screen rather than bundled with Export/Import
 * (JEF-204's reasoning, ported from apps/web) — irreversible and
 * password-gated, so it shouldn't be reachable by accident.
 */
export function DangerZoneScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const { withStepUp, dialog } = useStepUpReauth();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onDeleteAccount = async () => {
    setError(null);
    try {
      await withStepUp(() => deleteAccount.mutateAsync(password));
      await logout();
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      setError(getErrorMessage(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('danger.title')}</Text>
        <Text style={styles.description}>{t('danger.description')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder={t('danger.confirmPasswordPlaceholder')}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          testID="delete-account-password-input"
        />

        <Pressable
          style={[styles.deleteButton, deleteAccount.isPending && styles.deleteButtonDisabled]}
          onPress={onDeleteAccount}
          disabled={deleteAccount.isPending || !password}
          testID="delete-account-button"
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.deleteButtonText}>{t('danger.deleteMyAccount')}</Text>
          )}
        </Pressable>
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      padding: 16,
      gap: 12,
    },
    title: { fontSize: 15, fontWeight: '700', color: colors.danger },
    description: { fontSize: 13, color: colors.danger },
    input: {
      maxWidth: 320,
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
    deleteButton: {
      alignSelf: 'flex-start',
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    deleteButtonDisabled: { opacity: 0.6 },
    deleteButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  });
}
