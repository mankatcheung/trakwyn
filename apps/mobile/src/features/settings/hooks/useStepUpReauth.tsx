import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { gqlRequest } from '../../../graphql/client';
import { getErrorMessage } from '../../../lib/errors';
import { REAUTHENTICATE_MUTATION } from '../graphql/operations';
import type { ReauthenticateResult } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/** Thrown to the caller of `withStepUp` when the user dismisses the reauth dialog instead of completing it. */
export const STEP_UP_CANCELLED = 'step-up-cancelled';

/** Extracts the GraphQL `extensions.code` from a graphql-request error, e.g. `STEP_UP_REQUIRED` (JEF-44). */
function extractGqlErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: { extensions?: { code?: string } }[] } }).response;
    return r?.errors?.[0]?.extensions?.code ?? null;
  }
  return null;
}

interface PendingStepUp {
  retry: () => void;
  reject: (err: unknown) => void;
}

/**
 * Wraps a mutation call so a STEP_UP_REQUIRED error — thrown when a
 * TOTP-enabled account's session is stale (JEF-44) — transparently opens a
 * "confirm it's you" dialog and retries the original call once reauth
 * succeeds, instead of surfacing a raw GraphQL error to the caller. Ported
 * from apps/web's settings/-components/useStepUpReauth.tsx.
 */
export function useStepUpReauth(): {
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  dialog: React.ReactNode;
} {
  const [pending, setPending] = useState<PendingStepUp | null>(null);

  function withStepUp<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err: unknown) => {
      if (extractGqlErrorCode(err) !== 'STEP_UP_REQUIRED') throw err;
      return new Promise<T>((resolve, reject) => {
        setPending({
          retry: () => {
            setPending(null);
            fn().then(resolve, reject);
          },
          reject: (cancelErr) => {
            setPending(null);
            reject(cancelErr);
          },
        });
      });
    });
  }

  const dialog = pending ? (
    <StepUpReauthDialog
      onSuccess={pending.retry}
      onCancel={() => pending.reject(new Error(STEP_UP_CANCELLED))}
    />
  ) : null;

  return { withStepUp, dialog };
}

function StepUpReauthDialog({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await gqlRequest<{ reauthenticate: ReauthenticateResult }>(
        REAUTHENTICATE_MUTATION,
        { password, code: code || undefined },
      );
      if (res.reauthenticate.totpRequired) {
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
    <Modal transparent animationType="fade" onRequestClose={onCancel} testID="step-up-reauth-modal">
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{t('stepUp.title')}</Text>
          <Text style={styles.subtitle}>{t('stepUp.subtitle')}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder={t('stepUp.passwordPlaceholder')}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoFocus
            testID="step-up-password-input"
          />

          {totpRequired && (
            <TextInput
              style={styles.input}
              placeholder={t('stepUp.codePlaceholder')}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              autoFocus
              testID="step-up-code-input"
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} testID="step-up-cancel-button">
              <Text style={styles.cancelText}>{t('stepUp.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
              onPress={onSubmit}
              disabled={isSubmitting}
              testID="step-up-confirm-button"
            >
              <Text style={styles.confirmText}>
                {isSubmitting
                  ? t('stepUp.verifying')
                  : totpRequired
                    ? t('stepUp.verifyCode')
                    : t('stepUp.confirm')}
              </Text>
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
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 20,
      gap: 12,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSubtle },
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
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 4 },
    cancelText: { color: colors.textSubtle, fontSize: 14, fontWeight: '600', paddingVertical: 10 },
    confirmButton: {
      minWidth: 100,
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    confirmButtonDisabled: { opacity: 0.6 },
    confirmText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
  });
}
