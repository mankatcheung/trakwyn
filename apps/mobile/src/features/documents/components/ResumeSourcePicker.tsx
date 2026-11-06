import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useDocumentDrafts } from '../hooks/useDocumentDraftQueries';
import { documentCategory } from '../lib/documentCategory';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/** One of this application's resumes to base a cover letter on: an uploaded file or a resume draft. */
export interface ResumeChoice {
  kind: 'file' | 'draft';
  id: string;
}

interface ResumeSourcePickerProps {
  applicationId: string;
  /** `null` means the saved profile alone. */
  value: ResumeChoice | null;
  onChange: (choice: ResumeChoice | null) => void;
  disabled?: boolean;
}

export function ResumeSourcePicker({
  applicationId,
  value,
  onChange,
  disabled,
}: ResumeSourcePickerProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: documents } = useDocuments(applicationId);
  const { data: drafts } = useDocumentDrafts(applicationId);

  const options = [
    ...(documents ?? [])
      .filter((d) => documentCategory(d.documentType) === 'resume')
      .map((d) => ({ kind: 'file' as const, id: d.id, label: d.name })),
    ...(drafts ?? [])
      .filter((d) => documentCategory(d.type) === 'resume')
      .map((d) => ({ kind: 'draft' as const, id: d.id, label: d.title })),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('baseOnResumeLabel')}</Text>
      <Pressable
        style={[styles.option, !value && styles.optionSelected]}
        onPress={() => onChange(null)}
        disabled={disabled}
        testID="cover-letter-resume-none"
      >
        <Text style={[styles.optionText, !value && styles.optionTextSelected]}>
          {t('noResumeOption')}
        </Text>
      </Pressable>
      {options.map((option) => {
        const selected = value?.kind === option.kind && value.id === option.id;
        return (
          <Pressable
            key={`${option.kind}:${option.id}`}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange({ kind: option.kind, id: option.id })}
            disabled={disabled}
            testID={`cover-letter-resume-${option.kind}-${option.id}`}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 8 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text },
    option: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    optionSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
    optionText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
    optionTextSelected: { color: colors.primary, fontWeight: '700' },
  });
}
