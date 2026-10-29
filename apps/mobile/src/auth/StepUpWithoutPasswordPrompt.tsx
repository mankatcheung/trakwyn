import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { requestStepUpCode, type ReauthProvider } from './stepUp';
import { getErrorMessage } from '../lib/errors';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

/**
 * The step-up prompt for an account with no password (JEF-463): sign in again
 * with Google in the in-app browser, or a code mailed to the account. Either
 * refreshes the session's tokens, then the original call is retried.
 */
export function StepUpWithoutPasswordPrompt({
  providers,
  onSuccess,
  onCancel,
}: {
  providers: ReauthProvider[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reauthenticateWithProvider, verifyStepUpCode } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const withProvider = (provider: ReauthProvider) =>
    run(async () => {
      if (await reauthenticateWithProvider(provider)) onSuccess();
    });
  const sendCode = () =>
    run(async () => {
      await requestStepUpCode();
      setCodeSent(true);
    });
  const verify = () =>
    run(async () => {
      await verifyStepUpCode(code);
      onSuccess();
    });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="step-up-reauth">
          <Text style={styles.title}>{t('stepUp.title')}</Text>
          <Text style={styles.subtitle}>{t('stepUp.subtitleWithoutPassword')}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {providers.map((provider) => (
            <Pressable
              key={provider}
              style={[styles.secondaryButton, busy && styles.disabled]}
              onPress={() => void withProvider(provider)}
              disabled={busy}
              testID={`step-up-${provider}-button`}
            >
              <Text style={styles.secondaryText}>{t('stepUp.continueWithGoogle')}</Text>
            </Pressable>
          ))}

          <Text style={styles.subtitle}>
            {codeSent ? t('stepUp.codeSent') : t('stepUp.emailCodeIntro')}
          </Text>
          {codeSent ? (
            <TextInput
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              placeholder={t('stepUp.codePlaceholder')}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              autoFocus
              testID="step-up-email-code-input"
            />
          ) : (
            <Pressable
              style={[styles.secondaryButton, busy && styles.disabled]}
              onPress={() => void sendCode()}
              disabled={busy}
              testID="step-up-send-code-button"
            >
              <Text style={styles.secondaryText}>{t('stepUp.sendCode')}</Text>
            </Pressable>
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={busy} testID="step-up-cancel-button">
              <Text style={styles.cancelText}>{t('stepUp.cancel')}</Text>
            </Pressable>
            {codeSent ? (
              <Pressable
                style={[styles.confirmButton, (busy || !code.trim()) && styles.disabled]}
                onPress={() => void verify()}
                disabled={busy || !code.trim()}
                testID="step-up-verify-code-button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.confirmText}>{t('stepUp.verifyCode')}</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(17, 24, 39, 0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 12 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSubtle },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20 },
    cancelText: { color: colors.textSubtle, fontSize: 14, fontWeight: '600' },
    confirmButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.6 },
    confirmText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  });
}
