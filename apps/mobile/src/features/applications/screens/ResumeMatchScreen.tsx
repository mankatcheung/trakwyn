import React, { useMemo, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../../documents/hooks/useDocumentQueries';
import { useComputeResumeMatchScore } from '../hooks/useResumeMatchMutations';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function ResumeMatchScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: documents } = useDocuments(applicationId);
  const compute = useComputeResumeMatchScore(applicationId);
  const [resumeText, setResumeText] = useState('');
  const [overridePaste, setOverridePaste] = useState(false);

  const resumeDoc = (documents ?? [])
    .filter((doc) => doc.documentType === 'resume')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const usingUploadedResume = Boolean(resumeDoc) && !overridePaste;

  const onCompute = () => {
    compute.mutate(usingUploadedResume ? null : resumeText.trim() || null, {
      onError: (err) => Alert.alert(t('resumeMatch.couldNotCheckTitle'), getErrorMessage(err)),
    });
  };

  const result = compute.data;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {usingUploadedResume && resumeDoc ? (
            <View style={styles.usingResumeRow}>
              <Text style={styles.usingResumeText} numberOfLines={1}>
                {t('resumeMatch.usingUploadedResumePrefix')} {resumeDoc.name}
              </Text>
              <Pressable onPress={() => setOverridePaste(true)}>
                <Text style={styles.link}>{t('resumeMatch.pasteDifferentText')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.pasteBlock}>
              <Text style={styles.label}>{t('resumeMatch.yourResumeLabel')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder={t('resumeMatch.pasteResumePlaceholder')}
                placeholderTextColor={colors.textFaint}
                value={resumeText}
                onChangeText={setResumeText}
                multiline
                testID="resume-match-input"
              />
              {resumeDoc ? (
                <Pressable onPress={() => setOverridePaste(false)}>
                  <Text style={styles.link}>
                    {t('resumeMatch.useUploadedResumeInstead', { name: resumeDoc.name })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <Pressable
            style={[
              styles.checkButton,
              (compute.isPending || (!usingUploadedResume && !resumeText.trim())) &&
                styles.buttonDisabled,
            ]}
            onPress={onCompute}
            disabled={compute.isPending || (!usingUploadedResume && !resumeText.trim())}
            testID="compute-resume-match-button"
          >
            {compute.isPending ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.checkButtonText}>
                {result ? t('resumeMatch.checkAgain') : t('resumeMatch.checkMatch')}
              </Text>
            )}
          </Pressable>
        </View>

        {result ? (
          <View style={styles.card} testID="resume-match-result">
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{result.score}</Text>
              <Text style={styles.scoreLabel}>{result.label}</Text>
            </View>
            {result.summary ? <Text style={styles.summary}>{result.summary}</Text> : null}
            {result.matchedKeywords.length > 0 ? (
              <View>
                <Text style={styles.keywordsHeading}>{t('resumeMatch.matchedKeywords')}</Text>
                <View style={styles.keywordsRow}>
                  {result.matchedKeywords.map((kw) => (
                    <View key={kw} style={styles.matchedChip}>
                      <Text style={styles.matchedChipText}>{kw}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {result.missingKeywords.length > 0 ? (
              <View>
                <Text style={styles.keywordsHeading}>{t('resumeMatch.missingKeywords')}</Text>
                <View style={styles.keywordsRow}>
                  {result.missingKeywords.map((kw) => (
                    <View key={kw} style={styles.missingChip}>
                      <Text style={styles.missingChipText}>{kw}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
    usingResumeRow: { gap: 6 },
    usingResumeText: { fontSize: 13, color: colors.textMuted },
    pasteBlock: { gap: 8 },
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
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    checkButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minWidth: 100,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    checkButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    scoreValue: { fontSize: 28, fontWeight: '800', color: colors.text },
    scoreLabel: { fontSize: 14, fontWeight: '600', color: colors.textSubtle },
    summary: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    keywordsHeading: { fontSize: 12, fontWeight: '600', color: colors.textFaint, marginBottom: 6 },
    keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    matchedChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.successSurface,
    },
    matchedChipText: { fontSize: 12, color: colors.success, fontWeight: '600' },
    missingChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.dangerSurface,
    },
    missingChipText: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  });
}
