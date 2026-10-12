import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGenerateCoverLetter } from '../../applications/hooks/useCoverLetterMutations';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/**
 * The AI cover letter card, shown above the Cover letters list. Generation
 * saves a draft, so the next step is its editor rather than the pasted text.
 */
export function CoverLetterGenerator({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const generate = useGenerateCoverLetter(applicationId);
  const [resumeText, setResumeText] = useState('');

  const onGenerate = () => {
    generate.mutate(resumeText.trim() || null, {
      onSuccess: (draft) => {
        router.push(`./documents/${draft.id}` as never);
      },
      onError: (err) => Alert.alert(t('coverLetter.couldNotGenerateTitle'), getErrorMessage(err)),
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('coverLetter.resumeBackgroundLabel')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder={t('coverLetter.pastePlaceholder')}
        placeholderTextColor={colors.textFaint}
        value={resumeText}
        onChangeText={setResumeText}
        multiline
        testID="cover-letter-resume-input"
      />
      <Pressable
        style={[styles.generateButton, generate.isPending && styles.buttonDisabled]}
        onPress={onGenerate}
        disabled={generate.isPending}
        testID="generate-cover-letter-button"
      >
        {generate.isPending ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Text style={styles.generateButtonText}>{t('coverLetter.generateCoverLetter')}</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSubtle },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    multiline: { minHeight: 100, textAlignVertical: 'top' },
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
  });
}
