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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocumentDrafts } from '../../documents/hooks/useDocumentDraftQueries';
import { useGenerateCoverLetter } from '../hooks/useCoverLetterMutations';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export function CoverLetterScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: drafts, isLoading } = useDocumentDrafts(applicationId);
  const generate = useGenerateCoverLetter(applicationId);
  const [resumeText, setResumeText] = useState('');

  const letters = (drafts ?? []).filter((draft) => draft.type === 'cover_letter');

  const onGenerate = () => {
    generate.mutate(resumeText.trim() || null, {
      onSuccess: (draft) => {
        router.push(`./documents/${draft.id}` as never);
      },
      onError: (err) => Alert.alert(t('coverLetter.couldNotGenerateTitle'), getErrorMessage(err)),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('coverLetter.savedTitle')}</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : letters.length === 0 ? (
            <Text style={styles.emptyText}>{t('coverLetter.noneSavedYet')}</Text>
          ) : (
            letters.map((letter) => (
              <Pressable
                key={letter.id}
                style={styles.letterRow}
                onPress={() => router.push(`./documents/${letter.id}` as never)}
                testID={`cover-letter-${letter.id}`}
              >
                <Text style={styles.letterTitle} numberOfLines={1}>
                  {letter.title}
                </Text>
                <Text style={styles.letterDate}>
                  {new Date(letter.updatedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            ))
          )}
        </View>
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
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    emptyText: { fontSize: 13, color: colors.textFaint },
    letterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    letterTitle: { fontSize: 14, color: colors.text, flexShrink: 1, marginRight: 8 },
    letterDate: { fontSize: 12, color: colors.textFaint },
  });
}
