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
import { ERROR_CODES } from '../constants';
import { getErrorCode, getErrorMessage } from '../lib/errors';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

/** Thrown to the caller of `withStepUp` when the user dismisses the prompt instead of completing it — "nothing happened", not a failure to report. */
export class StepUpCancelledError extends Error {
  constructor() {
    super('Step-up re-authentication was cancelled');
    this.name = 'StepUpCancelledError';
  }
}

interface PendingStepUp {
  retry: () => void;
  cancel: () => void;
}

/**
 * Wraps a mutation call so a STEP_UP_REQUIRED error — thrown when a
 * TOTP-enabled account's session is stale (JEF-44) — opens a "confirm it's
 * you" prompt and retries the original call once reauthentication succeeds,
 * instead of surfacing the raw error. Ported from apps/web's useStepUpReauth.
 */
export function useStepUpReauth(): {
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  dialog: React.ReactNode;
} {
  const [pending, setPending] = useState<PendingStepUp | null>(null);

  function withStepUp<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err: unknown) => {
      if (getErrorCode(err) !== ERROR_CODES.STEP_UP_REQUIRED) throw err;
      return new Promise<T>((resolve, reject) => {
        setPending({
          retry: () => {
            setPending(null);
            fn().then(resolve, reject);
          },
          cancel: () => {
            setPending(null);
            reject(new StepUpCancelledError());
          },
        });
      });
    });
  }

  const dialog = pending ? (
    <StepUpReauthPrompt onSuccess={pending.retry} onCancel={pending.cancel} />
  ) : null;

  return { withStepUp, dialog };
}

function StepUpReauthPrompt({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reauthenticate } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!password) {
      setError(t('stepUp.passwordRequired'));
      return;
    }
    if (totpRequired && !code.trim()) {
      setError(t('validation.totpCode'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await reauthenticate(password, totpRequired ? code.trim() : undefined);
      if (result.totpRequired) {
        setTotpRequired(true);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="step-up-reauth">
          <Text style={styles.title}>{t('stepUp.title')}</Text>
          <Text style={styles.subtitle}>
            {totpRequired ? t('stepUp.subtitleWithTotp') : t('stepUp.subtitle')}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder={t('stepUp.passwordPlaceholder')}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            autoFocus={!totpRequired}
            testID="step-up-password-input"
          />
          {totpRequired ? (
            <TextInput
              style={styles.input}
              placeholder={t('stepUp.codePlaceholder')}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              autoFocus
              testID="step-up-code-input"
            />
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={isSubmitting} testID="step-up-cancel-button">
              <Text style={styles.cancelText}>{t('stepUp.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, isSubmitting && styles.disabled]}
              onPress={() => void onSubmit()}
              disabled={isSubmitting}
              testID="step-up-confirm-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.confirmText}>
                  {totpRequired ? t('stepUp.verifyCode') : t('stepUp.confirm')}
                </Text>
              )}
            </Pressable>
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
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 20,
      gap: 12,
    },
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
