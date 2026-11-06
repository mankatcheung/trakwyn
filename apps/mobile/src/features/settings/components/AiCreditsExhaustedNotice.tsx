import React, { useEffect, useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { WEB_URL } from '../../../constants';
import { ANALYTICS_EVENTS, captureEvent } from '../../../lib/analytics';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AiCreditsExhaustedNoticeProps {
  /** What the API said; it names the reset date. Falls back to generic copy. */
  message?: string | null;
  /** Where the notice is shown, for the analytics events. */
  surface: 'assistant' | 'settings' | 'conversations' | 'ai_action';
  /** `credits`: a Pro user's month is spent. `plan`: a Free user asked for Trakwyn AI (PLAN_REQUIRED). */
  reason?: 'credits' | 'plan';
}

/**
 * The 100% prompt (JEF-451): the credits are spent, and there are two ways
 * forward: upgrade (billing lives on the web, the app has no in-app purchase)
 * or add the user's own key.
 */
export function openPlanPage() {
  void Linking.openURL(`${WEB_URL}/settings/plan`);
}

export function AiCreditsExhaustedNotice({
  message,
  surface,
  reason = 'credits',
}: AiCreditsExhaustedNoticeProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.AI_CREDITS_EXHAUSTED_SHOWN, { surface, reason });
  }, [surface, reason]);

  const onUpgrade = () => {
    captureEvent(ANALYTICS_EVENTS.AI_UPGRADE_CLICKED, { surface });
    openPlanPage();
  };
  const onAddKey = () => {
    captureEvent(ANALYTICS_EVENTS.AI_ADD_KEY_CLICKED, { surface });
    router.push('/settings/ai');
  };

  return (
    <View style={styles.container} testID="ai-credits-exhausted-notice">
      <Text style={styles.message}>{message || t('ai.credits.exhaustedFallback')}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={onUpgrade} testID="ai-upgrade-button">
          <Text style={styles.primaryText}>{t('ai.credits.upgrade')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onAddKey} testID="ai-add-key-button">
          <Text style={styles.secondaryText}>{t('ai.credits.addOwnKey')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: 10,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    message: { fontSize: 14, color: colors.text },
    actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    primaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 14 },
    secondary: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    secondaryText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  });
}
