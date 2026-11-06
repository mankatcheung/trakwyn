import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AiActionBar } from '../../ai/components/AiActionBar';
import { Markdown } from '../../../components/Markdown';
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

  const [instructions, setInstructions] = useState('');

  const onGenerate = () => {
    const proceed = () =>
      generate.mutate(instructions, {
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
        <AiActionBar
          feature="companyBriefing"
          label={briefing ? t('companyBriefing.regenerate') : t('companyBriefing.generateBriefing')}
          loading={generate.isPending}
          disabled={isLoading}
          onRun={onGenerate}
          buttonTestID="generate-company-briefing-button"
          instructions={{
            value: instructions,
            onChange: setInstructions,
            placeholder: t('companyBriefing.promptPlaceholder'),
            inputTestID: 'company-briefing-prompt-input',
          }}
        />
      </View>

      {briefing ? (
        <View style={styles.card} testID="company-briefing-content">
          <Text style={styles.generatedAt}>
            {t('companyBriefing.generatedAt', {
              date: new Date(briefing.generatedAt).toLocaleString(),
            })}
          </Text>
          <Markdown content={briefing.content} />
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
    generatedAt: { fontSize: 12, color: colors.textFaint },
  });
}
