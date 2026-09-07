import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../hooks/useNotificationPreferences';
import { useEnablePushNotifications } from '../../push/hooks/usePushToken';
import { PushRegistrationError } from '../../push/lib/registerForPushNotifications';
import type { DigestFrequency } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function NotificationsScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const DIGEST_OPTIONS: { value: DigestFrequency; label: string }[] = [
    { value: 'OFF', label: t('notifications.digestOff') },
    { value: 'DAILY', label: t('notifications.digestDaily') },
    { value: 'WEEKLY', label: t('notifications.digestWeekly') },
  ];
  const { data: preferences, isLoading, isError, error } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();
  const enablePush = useEnablePushNotifications();

  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>('OFF');
  const [followUpRemindersEnabled, setFollowUpRemindersEnabled] = useState(false);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncedPreferences, setSyncedPreferences] = useState<typeof preferences>(undefined);

  if (preferences && preferences !== syncedPreferences) {
    setSyncedPreferences(preferences);
    setDigestFrequency(preferences.digestFrequency);
    setFollowUpRemindersEnabled(preferences.followUpRemindersEnabled);
    setPushNotificationsEnabled(preferences.pushNotificationsEnabled);
    setWeeklyGoal(preferences.weeklyApplicationGoal?.toString() ?? '');
  }

  const save = (overrides: Partial<Record<string, unknown>> = {}) => {
    setSaveError(null);
    const goal = parseInt(weeklyGoal, 10);
    updatePreferences.mutate(
      {
        digestFrequency,
        followUpRemindersEnabled,
        pushNotificationsEnabled,
        ...(Number.isFinite(goal) ? { weeklyApplicationGoal: goal } : {}),
        ...overrides,
      },
      { onError: (err) => setSaveError(getErrorMessage(err)) },
    );
  };

  const onTogglePush = (value: boolean) => {
    setSaveError(null);
    if (!value) {
      setPushNotificationsEnabled(false);
      save({ pushNotificationsEnabled: false });
      return;
    }

    enablePush.mutate(undefined, {
      onSuccess: () => {
        setPushNotificationsEnabled(true);
        save({ pushNotificationsEnabled: true });
      },
      onError: (err) =>
        setSaveError(err instanceof PushRegistrationError ? err.message : getErrorMessage(err)),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="notifications-loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('notifications.emailNotifications')}</Text>

        <View style={styles.fieldRow}>
          <View style={styles.fieldRowText}>
            <Text style={styles.label}>{t('notifications.digestEmails')}</Text>
            <Text style={styles.hint}>{t('notifications.digestEmailsHint')}</Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          {DIGEST_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, digestFrequency === option.value && styles.chipActive]}
              onPress={() => {
                setDigestFrequency(option.value);
                save({ digestFrequency: option.value });
              }}
              testID={`digest-${option.value.toLowerCase()}`}
            >
              <Text
                style={[styles.chipText, digestFrequency === option.value && styles.chipTextActive]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldRow}>
          <Text style={styles.label}>{t('notifications.followUpReminders')}</Text>
          <Switch
            value={followUpRemindersEnabled}
            onValueChange={(value) => {
              setFollowUpRemindersEnabled(value);
              save({ followUpRemindersEnabled: value });
            }}
            testID="follow-up-reminders-switch"
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldRow}>
          <View style={styles.fieldRowText}>
            <Text style={styles.label}>{t('notifications.weeklyGoal')}</Text>
            <Text style={styles.hint}>{t('notifications.weeklyGoalHint')}</Text>
          </View>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.goalInput}
            value={weeklyGoal}
            onChangeText={setWeeklyGoal}
            onEndEditing={() => save()}
            keyboardType="number-pad"
            testID="weekly-goal-input"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('notifications.pushNotificationsTitle')}</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.label}>{t('notifications.pushNotifications')}</Text>
          <Switch
            value={pushNotificationsEnabled}
            onValueChange={onTogglePush}
            disabled={enablePush.isPending}
            testID="push-notifications-switch"
          />
        </View>
      </View>
    </ScrollView>
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
      gap: 10,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    divider: { height: 1, backgroundColor: colors.border },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    fieldRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    fieldRowText: { flex: 1, gap: 2 },
    label: { fontSize: 15, fontWeight: '600', color: colors.text },
    hint: { fontSize: 12, color: colors.textSubtle },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    chipTextActive: { color: colors.surface },
    goalInput: {
      width: 64,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      textAlign: 'center',
      backgroundColor: colors.surface,
      color: colors.text,
    },
  });
}
