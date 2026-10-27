import React, { useEffect, useMemo, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/AuthContext';
import { ERROR_CODES } from '../../../constants';
import { getErrorCode, getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useRequestEmailChange } from '../../settings/hooks/useProfile';
import { useEmailVerification, useResendVerificationEmail } from '../hooks/useEmailVerification';

/** How long the resend button stays off after a link is sent; the API's own limit is three a day. */
export const RESEND_COOLDOWN_SECONDS = 60;

type Notice = { tone: 'success' | 'error'; text: string } | null;

/** Seconds left until a deadline, ticking once a second only while there are any. */
function useCooldown() {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const start = (forSeconds: number) => {
    const started = Date.now();
    setNow(started);
    setEndsAt(started + forSeconds * 1000);
  };
  return [seconds, start] as const;
}

/**
 * The full-screen reminder an unverified user gets in place of the app
 * (JEF-438), with the ways out of a lost or mistyped verification email:
 * resend, check again, use a different address, or sign out.
 */
export function VerifyEmailRequiredScreen({ email }: { email: string }) {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();
  const { refetch } = useEmailVerification();
  const resend = useResendVerificationEmail();
  const requestEmailChange = useRequestEmailChange();

  const [cooldown, startCooldown] = useCooldown();
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const onResend = async () => {
    setNotice(null);
    try {
      await resend.mutateAsync();
      startCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice({ tone: 'success', text: t('verifyRequired.sent', { email }) });
    } catch (err) {
      const rateLimited = getErrorCode(err) === ERROR_CODES.RATE_LIMITED;
      setNotice({
        tone: 'error',
        text: t(rateLimited ? 'verifyRequired.rateLimited' : 'verifyRequired.resendFailed'),
      });
    }
  };

  const onCheckAgain = async () => {
    setChecking(true);
    setNotice(null);
    try {
      const { data } = await refetch();
      // Verified: the layout swaps this screen for the app. Otherwise say so,
      // or the tap looks like it did nothing.
      if (data && !data.emailVerified) {
        setNotice({ tone: 'error', text: t('verifyRequired.stillUnverified') });
      }
    } finally {
      setChecking(false);
    }
  };

  const onChangeEmail = async () => {
    setNotice(null);
    try {
      await requestEmailChange.mutateAsync({ currentPassword, newEmail: newEmail.trim() });
      setNotice({
        tone: 'success',
        text: t('verifyRequired.changeEmailSent', { email: newEmail.trim() }),
      });
      setChanging(false);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      setNotice({ tone: 'error', text: getErrorMessage(err) });
    }
  };

  const resendLabel = resend.isPending
    ? t('verifyRequired.sending')
    : cooldown > 0
      ? t('verifyRequired.resendIn', { seconds: cooldown })
      : t('verifyRequired.resend');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="verify-email-required"
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {t('verifyRequired.title')}
          </Text>
          <Text style={styles.body}>{t('verifyRequired.body', { email })}</Text>
          <Text style={styles.body}>{t('verifyRequired.spamHint')}</Text>

          {notice ? (
            <Text
              style={notice.tone === 'success' ? styles.success : styles.error}
              testID="verify-email-notice"
            >
              {notice.text}
            </Text>
          ) : null}

          <Pressable
            style={[styles.button, (resend.isPending || cooldown > 0) && styles.buttonDisabled]}
            onPress={onResend}
            disabled={resend.isPending || cooldown > 0}
            accessibilityRole="button"
            testID="verify-email-resend"
          >
            {resend.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>{resendLabel}</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, checking && styles.buttonDisabled]}
            onPress={onCheckAgain}
            disabled={checking}
            accessibilityRole="button"
            testID="verify-email-check"
          >
            <Text style={styles.secondaryButtonText}>{t('verifyRequired.checkAgain')}</Text>
          </Pressable>

          {changing ? (
            <View style={styles.changeForm}>
              <Text style={styles.body}>{t('verifyRequired.changeEmailIntro')}</Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('verifyRequired.newEmailLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder={t('verifyRequired.emailPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  testID="verify-email-new-email"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('verifyRequired.passwordLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  placeholderTextColor={colors.textFaint}
                  testID="verify-email-password"
                />
              </View>
              <Pressable
                style={[styles.button, requestEmailChange.isPending && styles.buttonDisabled]}
                onPress={onChangeEmail}
                disabled={requestEmailChange.isPending || !newEmail.trim() || !currentPassword}
                accessibilityRole="button"
                testID="verify-email-change-submit"
              >
                {requestEmailChange.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.buttonText}>{t('verifyRequired.changeEmailSubmit')}</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setChanging(false)} testID="verify-email-change-cancel">
                <Text style={styles.backToSignIn}>{t('verifyRequired.cancel')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setChanging(true)} testID="verify-email-change">
              <Text style={styles.link}>{t('verifyRequired.changeEmail')}</Text>
            </Pressable>
          )}

          <View style={styles.divider} />

          <Pressable onPress={() => void logout()} testID="verify-email-sign-out">
            <Text style={styles.backToSignIn}>{t('verifyRequired.signOut')}</Text>
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
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.textSubtle },
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
    secondaryButton: {
      minHeight: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    changeForm: { gap: 12 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    success: {
      color: colors.success,
      backgroundColor: colors.successSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    divider: { height: 1, backgroundColor: colors.border },
    link: { color: colors.primary, textAlign: 'center', fontSize: 14, fontWeight: '600' },
    backToSignIn: { color: colors.textSubtle, textAlign: 'center', fontSize: 14 },
  });
}
