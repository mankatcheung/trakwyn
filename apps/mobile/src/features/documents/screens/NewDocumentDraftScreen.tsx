import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePathname, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useCreateDocumentDraft } from '../hooks/useCreateDocumentDraft';
import { useExtractDocumentText } from '../hooks/useExtractDocumentText';
import { useGenerateResume } from '../hooks/useGenerateResume';
import { proseToTiptapDoc } from '../../../lib/proseToTiptapDoc';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { DocumentDraftType } from '../types';

const DRAFT_TYPES: DocumentDraftType[] = ['cover_letter', 'resume'];

export function NewDocumentDraftScreen() {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const pathname = usePathname();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();

  const { data: documents } = useDocuments(applicationId);
  const createDraft = useCreateDocumentDraft(applicationId);
  const extractText = useExtractDocumentText();
  const generateResume = useGenerateResume(applicationId);

  const [type, setType] = useState<DocumentDraftType>('cover_letter');
  const [title, setTitle] = useState('');
  const [sourceDocumentId, setSourceDocumentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const busy = createDraft.isPending || extractText.isPending || generateResume.isPending;

  // `router.replace('../draftId')` resolves against the matched file route
  // (group segments included) rather than the browser pathname on web,
  // landing on an unmatched URL — deriving the target from the actual
  // pathname sidesteps that and works the same on every platform.
  const openDraft = (draftId: string) => router.replace(pathname.replace(/\/new$/, `/${draftId}`));

  const handleCreate = async () => {
    setError(null);
    try {
      let contentJson: string;
      let plainText: string;
      if (sourceDocumentId) {
        const text = await extractText.mutateAsync(sourceDocumentId);
        ({ contentJson, plainText } = proseToTiptapDoc(text));
      } else {
        ({ contentJson, plainText } = proseToTiptapDoc(''));
      }

      const draft = await createDraft.mutateAsync({
        applicationId,
        type,
        title: title.trim() || t(type === 'cover_letter' ? 'cover_letter' : 'resume'),
        contentJson,
        plainText,
        sourceDocumentId: sourceDocumentId || null,
      });
      openDraft(draft.id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleGenerate = async () => {
    setError(null);
    try {
      const draft = await generateResume.mutateAsync();
      openDraft(draft.id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>{t('typeLabel')}</Text>
      <View style={styles.typeToggleRow}>
        {DRAFT_TYPES.map((option) => {
          const selected = type === option;
          return (
            <Pressable
              key={option}
              style={[styles.typeToggle, selected && styles.typeToggleSelected]}
              onPress={() => setType(option)}
              testID={`draft-type-${option}`}
            >
              <Text style={[styles.typeToggleText, selected && styles.typeToggleTextSelected]}>
                {t(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{t('titleLabel')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t(type === 'cover_letter' ? 'cover_letter' : 'resume')}
        placeholderTextColor={colors.textFaint}
        testID="draft-title-input"
      />

      <Text style={styles.sectionLabel}>{t('startFromLabel')}</Text>
      <Text style={styles.helpText}>{t('startFromHelp')}</Text>
      <View style={styles.sourceList}>
        <Pressable
          style={[styles.sourceOption, !sourceDocumentId && styles.sourceOptionSelected]}
          onPress={() => setSourceDocumentId('')}
        >
          <Text
            style={[styles.sourceOptionText, !sourceDocumentId && styles.sourceOptionTextSelected]}
          >
            {t('blankOption')}
          </Text>
        </Pressable>
        {(documents ?? []).map((doc) => {
          const selected = sourceDocumentId === doc.id;
          return (
            <Pressable
              key={doc.id}
              style={[styles.sourceOption, selected && styles.sourceOptionSelected]}
              onPress={() => setSourceDocumentId(doc.id)}
            >
              <Text style={[styles.sourceOptionText, selected && styles.sourceOptionTextSelected]}>
                {doc.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {type === 'resume' && (
        <View style={styles.generateCard}>
          <Text style={styles.generateTitle}>{t('generateResumeTitle')}</Text>
          <Text style={styles.generateHelp}>{t('generateResumeHelp')}</Text>
          <Pressable
            style={[styles.generateButton, busy && styles.disabled]}
            onPress={() => void handleGenerate()}
            disabled={busy}
            testID="generate-resume-button"
          >
            <Text style={styles.generateButtonText}>
              {generateResume.isPending ? t('generating') : `✨ ${t('generateResume')}`}
            </Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actionsRow}>
        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={busy}>
          <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.createButton, (busy || !title.trim()) && styles.disabled]}
          onPress={() => void handleCreate()}
          disabled={busy || !title.trim()}
          testID="create-draft-button"
        >
          {createDraft.isPending || extractText.isPending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text style={styles.createButtonText}>{t('createDraft')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 8, paddingBottom: 40 },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12 },
    helpText: { fontSize: 12, color: colors.textSubtle, marginBottom: 4 },
    typeToggleRow: { flexDirection: 'row', gap: 10 },
    typeToggle: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    typeToggleSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
    typeToggleText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
    typeToggleTextSelected: { color: colors.primary, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    sourceList: { gap: 8 },
    sourceOption: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    sourceOptionSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
    sourceOptionText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
    sourceOptionTextSelected: { color: colors.primary, fontWeight: '700' },
    generateCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySurface,
      padding: 14,
      gap: 6,
      marginTop: 8,
    },
    generateTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    generateHelp: { fontSize: 12, color: colors.textSubtle },
    generateButton: {
      marginTop: 6,
      alignSelf: 'flex-start',
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    generateButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    actionsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    cancelButton: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: colors.surface,
    },
    cancelButtonText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    createButton: {
      flex: 1,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: colors.primary,
    },
    createButtonText: { fontSize: 14, fontWeight: '600', color: colors.onPrimary },
    disabled: { opacity: 0.6 },
  });
}
