import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
  useUpdatePassword,
} from '../hooks/useSessions';
import { useLinkedOAuthAccounts, useUnlinkOAuthAccount } from '../hooks/useLinkedOAuthAccounts';
import type { LinkedOAuthAccount, OAuthProvider, Session } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { StepUpCancelledError, useStepUpReauth } from '../../../auth/useStepUpReauth';
import { OAuthProviderLogo } from '../../../screens/auth/OAuthProviderLogo';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'github'];

function oauthProviderLabel(t: (key: string) => string, provider: OAuthProvider): string {
  return provider === 'google' ? t('security.providerGoogle') : t('security.providerGithub');
}

function LinkedAccountRow({
  provider,
  linked,
  onUnlink,
  isUnlinking,
}: {
  provider: OAuthProvider;
  linked: LinkedOAuthAccount | undefined;
  onUnlink: () => void;
  isUnlinking: boolean;
}) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const providerLabel = oauthProviderLabel(t, provider);
  return (
    <View style={styles.oauthRow} testID={`linked-account-${provider}`}>
      <View style={styles.oauthRowMain}>
        <OAuthProviderLogo provider={provider} size={20} />
        <View style={styles.textColumn}>
          <Text style={styles.sessionTitle}>{providerLabel}</Text>
          <Text style={styles.sessionMeta}>
            {linked
              ? t('security.linkedSince', {
                  email: linked.email ?? t('security.linkedDefault'),
                  date: new Date(linked.createdAt).toLocaleDateString(),
                })
              : t('security.notLinked')}
          </Text>
        </View>
      </View>
      {linked ? (
        <Pressable onPress={onUnlink} disabled={isUnlinking} testID={`unlink-oauth-${provider}`}>
          <Text style={styles.linkDanger}>
            {isUnlinking ? t('security.unlinking') : t('security.unlink')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: () => void }) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sessionRow} testID={`session-${session.id}`}>
      <View style={styles.textColumn}>
        <Text style={styles.sessionTitle}>
          {session.deviceLabel ?? session.userAgent ?? t('security.unknownDevice')}
          {session.current ? t('security.thisDevice') : ''}
        </Text>
        <Text style={styles.sessionMeta}>
          {[session.location, session.ipAddress].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.sessionMeta}>
          {t('security.lastUsed', { date: new Date(session.lastUsedAt).toLocaleString() })}
        </Text>
      </View>
      {!session.current ? (
        <Pressable onPress={onRevoke} testID={`revoke-session-${session.id}`}>
          <Text style={styles.linkDanger}>{t('security.revoke')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SecurityScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: sessions, isLoading, isError, error } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const updatePassword = useUpdatePassword();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();
  const {
    data: linkedAccounts,
    isLoading: linkedAccountsLoading,
    isError: linkedAccountsError,
    error: linkedAccountsErrorObj,
  } = useLinkedOAuthAccounts();
  const unlinkOAuthAccount = useUnlinkOAuthAccount();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const onChangePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError(t('security.newPasswordTooShort'));
      return;
    }
    try {
      // A TOTP-enabled account with a stale session gets STEP_UP_REQUIRED
      // here; withStepUp prompts for a fresh sign-in and retries.
      await withStepUp(() => updatePassword.mutateAsync({ currentPassword, newPassword }));
      setPasswordSaved(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      if (err instanceof StepUpCancelledError) return;
      setPasswordError(getErrorMessage(err));
    }
  };

  const onRevokeOthers = () => {
    Alert.alert(
      t('security.signOutOtherSessionsTitle'),
      t('security.signOutOtherSessionsMessage'),
      [
        { text: t('security.cancel'), style: 'cancel' },
        {
          text: t('security.signOutOtherSessions'),
          style: 'destructive',
          onPress: () =>
            revokeOthers.mutate(undefined, {
              onError: (err) =>
                Alert.alert(t('security.couldNotSignOutOthers'), getErrorMessage(err)),
            }),
        },
      ],
    );
  };

  const onUnlink = (provider: OAuthProvider) => {
    const providerLabel = oauthProviderLabel(t, provider);
    Alert.alert(
      t('security.unlinkTitle', { provider: providerLabel }),
      t('security.unlinkMessage', { provider: providerLabel }),
      [
        { text: t('security.cancel'), style: 'cancel' },
        {
          text: t('security.unlink'),
          style: 'destructive',
          onPress: () =>
            unlinkOAuthAccount.mutate(provider, {
              onError: (err) => Alert.alert(t('security.couldNotUnlink'), getErrorMessage(err)),
            }),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('security.sessionsTitle')}</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} testID="sessions-loading" />
        ) : isError ? (
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        ) : (
          <>
            {(sessions ?? []).map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onRevoke={() =>
                  revokeSession.mutate(session.id, {
                    onError: (err) =>
                      Alert.alert(t('security.couldNotRevoke'), getErrorMessage(err)),
                  })
                }
              />
            ))}
            {(sessions ?? []).length > 1 ? (
              <Pressable
                style={styles.revokeOthersButton}
                onPress={onRevokeOthers}
                testID="revoke-other-sessions-button"
              >
                <Text style={styles.revokeOthersText}>{t('security.signOutOtherSessions')}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Text style={[styles.sectionTitle, styles.sectionSpacing]}>
          {t('security.linkedAccountsTitle')}
        </Text>
        {linkedAccountsLoading ? (
          <ActivityIndicator color={colors.primary} testID="linked-accounts-loading" />
        ) : linkedAccountsError ? (
          <Text style={styles.error}>{getErrorMessage(linkedAccountsErrorObj)}</Text>
        ) : (
          OAUTH_PROVIDERS.map((provider) => (
            <LinkedAccountRow
              key={provider}
              provider={provider}
              linked={(linkedAccounts ?? []).find((a) => a.provider === provider)}
              onUnlink={() => onUnlink(provider)}
              isUnlinking={
                unlinkOAuthAccount.isPending && unlinkOAuthAccount.variables === provider
              }
            />
          ))
        )}

        <Text style={[styles.sectionTitle, styles.sectionSpacing]}>
          {t('security.changePasswordTitle')}
        </Text>
        {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
        {passwordSaved ? <Text style={styles.success}>{t('security.passwordUpdated')}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder={t('security.currentPasswordPlaceholder')}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          testID="current-password-input"
        />
        <TextInput
          style={styles.input}
          placeholder={t('security.newPasswordPlaceholder')}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          testID="new-password-input"
        />
        <Pressable
          style={[styles.saveButton, updatePassword.isPending && styles.saveButtonDisabled]}
          onPress={() => void onChangePassword()}
          disabled={updatePassword.isPending}
          testID="change-password-button"
        >
          <Text style={styles.saveButtonText}>
            {updatePassword.isPending ? t('security.saving') : t('security.updatePassword')}
          </Text>
        </Pressable>
      </ScrollView>
      {stepUpDialog}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    sectionSpacing: { marginTop: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    success: {
      color: '#047857',
      backgroundColor: '#d1fae5',
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    sessionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    textColumn: { flex: 1, gap: 2 },
    oauthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    oauthRowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    sessionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    sessionMeta: { fontSize: 12, color: colors.textSubtle },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    revokeOthersButton: {
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revokeOthersText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    saveButton: {
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
  });
}
