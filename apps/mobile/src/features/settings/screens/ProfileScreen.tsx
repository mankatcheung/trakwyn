import React, { useState, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Image,
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
  useProfile,
  useRemoveAvatar,
  useRemoveBackupEmail,
  useRequestAddBackupEmail,
  useRequestEmailChange,
  useUpdateProfile,
  useUploadAvatar,
} from '../hooks/useProfile';
import { TimezonePicker } from '../components/TimezonePicker';
import { getErrorMessage } from '../../../lib/errors';
import { StepUpCancelledError, useStepUpReauth } from '../../../auth/useStepUpReauth';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors, ThemeMode } from '../../../theme/colors';

export function ProfileScreen() {
  const { t } = useTranslation('settings');
  const { t: tAppearance } = useTranslation('appearance');
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: tAppearance('light') },
    { value: 'dark', label: tAppearance('dark') },
    { value: 'system', label: tAppearance('system') },
  ];
  const { data: profile, isLoading, isError, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const requestEmailChange = useRequestEmailChange();
  const requestAddBackupEmail = useRequestAddBackupEmail();
  const removeBackupEmail = useRemoveBackupEmail();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncedProfile, setSyncedProfile] = useState<typeof profile>(undefined);

  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const [backupEmailInput, setBackupEmailInput] = useState('');
  const [backupEmailPassword, setBackupEmailPassword] = useState('');
  const [backupEmailError, setBackupEmailError] = useState<string | null>(null);
  const [backupEmailSent, setBackupEmailSent] = useState(false);
  const [removeBackupPassword, setRemoveBackupPassword] = useState('');
  const [removeBackupError, setRemoveBackupError] = useState<string | null>(null);

  if (profile && profile !== syncedProfile) {
    setSyncedProfile(profile);
    setName(profile.name ?? '');
    setTimezone(profile.timezone ?? '');
    setTargetRole(profile.targetRole ?? '');
  }

  const onSave = () => {
    setSaveError(null);
    setSaved(false);
    updateProfile.mutate(
      { name, timezone, targetRole },
      {
        onSuccess: () => setSaved(true),
        onError: (err) => setSaveError(getErrorMessage(err)),
      },
    );
  };

  const onPickAvatar = async () => {
    setAvatarError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    uploadAvatar.mutate(
      {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.size ?? 0,
      },
      { onError: (err) => setAvatarError(getErrorMessage(err)) },
    );
  };

  const onRemoveAvatar = () => {
    setAvatarError(null);
    removeAvatar.mutate(undefined, { onError: (err) => setAvatarError(getErrorMessage(err)) });
  };

  const onUpdateEmail = async () => {
    setEmailError(null);
    setEmailSent(false);
    try {
      await withStepUp(() =>
        requestEmailChange.mutateAsync({ currentPassword: emailPassword, newEmail }),
      );
      setEmailPassword('');
      setNewEmail('');
      setEmailSent(true);
    } catch (err) {
      if (err instanceof StepUpCancelledError) return;
      setEmailError(getErrorMessage(err));
    }
  };

  const onAddBackupEmail = async () => {
    setBackupEmailError(null);
    setBackupEmailSent(false);
    try {
      await withStepUp(() =>
        requestAddBackupEmail.mutateAsync({
          currentPassword: backupEmailPassword,
          backupEmail: backupEmailInput,
        }),
      );
      setBackupEmailInput('');
      setBackupEmailPassword('');
      setBackupEmailSent(true);
    } catch (err) {
      if (err instanceof StepUpCancelledError) return;
      setBackupEmailError(getErrorMessage(err));
    }
  };

  const onRemoveBackupEmail = async () => {
    setRemoveBackupError(null);
    try {
      await withStepUp(() => removeBackupEmail.mutateAsync(removeBackupPassword));
      setRemoveBackupPassword('');
    } catch (err) {
      if (err instanceof StepUpCancelledError) return;
      setRemoveBackupError(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="profile-loading" />
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          {error ? getErrorMessage(error) : t('profile.couldNotLoad')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          {saved ? <Text style={styles.success}>{t('profile.saved')}</Text> : null}

          <View style={styles.avatarRow}>
            {profile.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.avatarImage}
                testID="profile-avatar-image"
              />
            ) : (
              <View style={styles.avatarPlaceholder} testID="profile-avatar-placeholder">
                <Text style={styles.avatarPlaceholderText}>
                  {(profile.name || profile.email).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.avatarActions}>
              <Pressable
                onPress={() => void onPickAvatar()}
                disabled={uploadAvatar.isPending}
                testID="profile-upload-avatar-button"
              >
                <Text style={styles.link}>
                  {uploadAvatar.isPending
                    ? t('profile.uploading')
                    : profile.avatarUrl
                      ? t('profile.changePhoto')
                      : t('profile.uploadPhoto')}
                </Text>
              </Pressable>
              <Text style={styles.avatarHint}>{t('profile.photoHint')}</Text>
              {profile.avatarUrl ? (
                <Pressable
                  onPress={onRemoveAvatar}
                  disabled={removeAvatar.isPending}
                  testID="profile-remove-avatar-button"
                >
                  <Text style={styles.linkDanger}>{t('profile.removePhoto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {avatarError ? <Text style={styles.error}>{avatarError}</Text> : null}

          <Text style={styles.label}>{t('profile.nameLabel')}</Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('profile.namePlaceholder')}
            testID="profile-name-input"
          />

          <Text style={styles.label}>{t('profile.timezoneLabel')}</Text>
          <TimezonePicker value={timezone} onChange={setTimezone} testID="profile-timezone-input" />

          <Text style={styles.label}>{t('profile.targetRoleLabel')}</Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={targetRole}
            onChangeText={setTargetRole}
            placeholder={t('profile.targetRolePlaceholder')}
            testID="profile-target-role-input"
          />

          <Pressable
            style={[styles.saveButton, updateProfile.isPending && styles.saveButtonDisabled]}
            onPress={onSave}
            disabled={updateProfile.isPending}
            testID="profile-save-button"
          >
            <Text style={styles.saveButtonText}>
              {updateProfile.isPending ? t('profile.saving') : t('profile.save')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.emailSectionTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('profile.emailSectionDescription')}</Text>
          {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
          {emailSent ? <Text style={styles.success}>{t('profile.emailChangeSent')}</Text> : null}

          <View style={styles.readOnlyRow}>
            <Text style={styles.readOnly}>{profile.email}</Text>
            <Text style={styles.link}>{t('profile.change')}</Text>
          </View>

          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={emailPassword}
            onChangeText={setEmailPassword}
            placeholder={t('profile.currentPasswordPlaceholder')}
            secureTextEntry
            testID="profile-email-current-password-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder={t('profile.newEmailPlaceholder')}
            autoCapitalize="none"
            keyboardType="email-address"
            testID="profile-new-email-input"
          />
          <Pressable
            style={[styles.saveButton, requestEmailChange.isPending && styles.saveButtonDisabled]}
            onPress={() => void onUpdateEmail()}
            disabled={requestEmailChange.isPending || !emailPassword || !newEmail}
            testID="profile-update-email-button"
          >
            <Text style={styles.saveButtonText}>
              {requestEmailChange.isPending ? t('profile.saving') : t('profile.updateEmail')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.backupEmailSectionTitle')}</Text>
          <Text style={styles.sectionDescription}>{t('profile.backupEmailDescription')}</Text>
          {profile.backupEmail ? (
            <>
              <Text style={styles.readOnly} testID="profile-backup-email-value">
                {profile.backupEmail}
                {'  '}
                {profile.backupEmailVerifiedAt
                  ? t('profile.backupEmailVerified')
                  : t('profile.backupEmailPending')}
              </Text>
              {removeBackupError ? <Text style={styles.error}>{removeBackupError}</Text> : null}
              <TextInput
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                value={removeBackupPassword}
                onChangeText={setRemoveBackupPassword}
                placeholder={t('profile.currentPasswordPlaceholder')}
                secureTextEntry
                testID="profile-remove-backup-email-password-input"
              />
              <Pressable
                style={[
                  styles.dangerButton,
                  removeBackupEmail.isPending && styles.saveButtonDisabled,
                ]}
                onPress={() => void onRemoveBackupEmail()}
                disabled={removeBackupEmail.isPending || !removeBackupPassword}
                testID="profile-remove-backup-email-button"
              >
                <Text style={styles.dangerButtonText}>
                  {removeBackupEmail.isPending
                    ? t('profile.saving')
                    : t('profile.removeBackupEmail')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {backupEmailError ? <Text style={styles.error}>{backupEmailError}</Text> : null}
              {backupEmailSent ? (
                <Text style={styles.success}>{t('profile.backupEmailAdded')}</Text>
              ) : null}
              <TextInput
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                value={backupEmailInput}
                onChangeText={setBackupEmailInput}
                placeholder={t('profile.backupEmailPlaceholder')}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="profile-backup-email-input"
              />
              <TextInput
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                value={backupEmailPassword}
                onChangeText={setBackupEmailPassword}
                placeholder={t('profile.currentPasswordPlaceholder')}
                secureTextEntry
                testID="profile-backup-email-password-input"
              />
              <Pressable
                style={[
                  styles.saveButton,
                  requestAddBackupEmail.isPending && styles.saveButtonDisabled,
                ]}
                onPress={() => void onAddBackupEmail()}
                disabled={
                  requestAddBackupEmail.isPending || !backupEmailInput || !backupEmailPassword
                }
                testID="profile-add-backup-email-button"
              >
                <Text style={styles.saveButtonText}>
                  {requestAddBackupEmail.isPending
                    ? t('profile.saving')
                    : t('profile.addBackupEmail')}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tAppearance('themeLabel')}</Text>
          <View style={styles.segmentedRow}>
            {MODE_OPTIONS.map((option) => {
              const selected = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  onPress={() => setMode(option.value)}
                  testID={`profile-appearance-${option.value}`}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      {stepUpDialog}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 6,
    },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      marginBottom: 8,
    },
    success: {
      color: colors.success,
      backgroundColor: colors.successSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      marginBottom: 8,
    },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
    avatarImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt },
    avatarPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPlaceholderText: { fontSize: 24, fontWeight: '700', color: colors.primary },
    avatarActions: { gap: 4 },
    avatarHint: { fontSize: 12, color: colors.textFaint },
    link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 14, fontWeight: '600' },
    label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 10 },
    readOnly: { fontSize: 15, color: colors.textSubtle },
    readOnlyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 4,
    },
    segmentedRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      minHeight: 40,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentSelected: { backgroundColor: colors.primary },
    segmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    segmentTextSelected: { color: colors.onPrimary },
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
      marginTop: 20,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
    dangerButton: {
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    dangerButtonText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    sectionDescription: { fontSize: 13, color: colors.textSubtle, marginBottom: 4 },
  });
}
