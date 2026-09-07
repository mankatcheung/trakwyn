import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gqlRequest } from '../../graphql/client';
import { getErrorMessage } from '../../lib/errors';
import { forgotPasswordSchema } from './forgotPasswordSchema';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

const REQUEST_PASSWORD_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

const REQUEST_BACKUP_EMAIL_RECOVERY_MUTATION = `
  mutation RequestBackupEmailRecovery($backupEmail: String!) {
    requestBackupEmailRecovery(backupEmail: $backupEmail)
  }
`;

type RecoveryMode = 'primary' | 'backup';

export function ForgotPasswordScreen() {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('primary');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const onSubmit = async () => {
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('validation.invalidInput'));
      return;
    }

    setIsSubmitting(true);
    try {
      // Always resolves — the backend responds identically for known and
      // unknown emails so this form can't be used to enumerate accounts.
      if (recoveryMode === 'backup') {
        await gqlRequest(REQUEST_BACKUP_EMAIL_RECOVERY_MUTATION, {
          backupEmail: parsed.data.email,
        });
      } else {
        await gqlRequest(REQUEST_PASSWORD_RESET_MUTATION, { email: parsed.data.email });
      }
      setIsSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          style={styles.backButton}
          onPress={() => router.push('/login')}
          hitSlop={12}
          testID="forgot-password-back-button"
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>{t('forgotPassword.title')}</Text>
          <Text style={styles.subtitle}>
            {recoveryMode === 'backup'
              ? t('forgotPassword.subtitleBackup')
              : t('forgotPassword.subtitlePrimary')}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isSubmitted ? (
            <Text style={styles.success} testID="forgot-password-success">
              {t('forgotPassword.successMessage')}
            </Text>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('forgotPassword.emailLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  testID="forgot-password-email-input"
                />
              </View>

              <Pressable
                style={[styles.button, isSubmitting && styles.buttonDisabled]}
                onPress={onSubmit}
                disabled={isSubmitting}
                testID="forgot-password-submit-button"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>
                    {recoveryMode === 'backup'
                      ? t('forgotPassword.sendRecoveryLink')
                      : t('forgotPassword.sendResetLink')}
                  </Text>
                )}
              </Pressable>
            </>
          )}

          <View style={styles.divider} />

          <Pressable
            onPress={() => setRecoveryMode((mode) => (mode === 'primary' ? 'backup' : 'primary'))}
          >
            <Text style={styles.link}>
              {recoveryMode === 'primary'
                ? t('forgotPassword.useBackupEmail')
                : t('forgotPassword.usePrimaryEmail')}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/login')}>
            <Text style={styles.backToSignIn}>{t('forgotPassword.backToSignIn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    backButton: {
      position: 'absolute',
      top: 16,
      left: 16,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backChevron: { fontSize: 26, color: colors.text, fontWeight: '600' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      gap: 16,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    title: { fontSize: 26, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSubtle, marginTop: -8 },
    field: { gap: 6 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    button: {
      minHeight: 48,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    success: {
      color: '#166534',
      backgroundColor: '#f0fdf4',
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    divider: { height: 1, backgroundColor: colors.border },
    link: { color: colors.primary, textAlign: 'center', fontSize: 14, fontWeight: '600' },
    backToSignIn: { color: colors.textSubtle, textAlign: 'center', fontSize: 14, marginTop: -4 },
  });
}
