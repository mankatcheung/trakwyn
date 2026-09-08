import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCompanyBriefing } from '../hooks/useCompanyBriefingQueries';
import { useGenerateCompanyBriefing } from '../hooks/useCompanyBriefingMutations';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function CompanyBriefingScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: briefing, isLoading } = useCompanyBriefing(applicationId);
  const generate = useGenerateCompanyBriefing(applicationId);

  const onGenerate = () => {
    const proceed = () =>
      generate.mutate(undefined, {
        onError: (err) =>
          Alert.alert(t('companyBriefing.couldNotGenerateTitle'), getErrorMessage(err)),
      });

    if (briefing) {
      Alert.alert(
        t('companyBriefing.regenerateConfirmTitle'),
        t('companyBriefing.regenerateConfirm'),
        [
          { text: t('detail.cancel'), style: 'cancel' },
          { text: t('companyBriefing.regenerate'), onPress: proceed },
        ],
      );
    } else {
      proceed();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.description}>{t('companyBriefing.description')}</Text>
        <Pressable
          style={[styles.generateButton, generate.isPending && styles.buttonDisabled]}
          onPress={onGenerate}
          disabled={generate.isPending || isLoading}
          testID="generate-company-briefing-button"
        >
          {generate.isPending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.generateButtonText}>
              {briefing ? t('companyBriefing.regenerate') : t('companyBriefing.generateBriefing')}
            </Text>
          )}
        </Pressable>
      </View>

      {briefing ? (
        <View style={styles.card} testID="company-briefing-content">
          <Text style={styles.generatedAt}>
            {t('companyBriefing.generatedAt', {
              date: new Date(briefing.generatedAt).toLocaleString(),
            })}
          </Text>
          <Text style={styles.briefingText}>{briefing.content}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
    description: { fontSize: 14, color: colors.textMuted },
    generateButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minWidth: 100,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    generateButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    generatedAt: { fontSize: 12, color: colors.textFaint },
    briefingText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  });
}
