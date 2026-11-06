import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../lib/errors';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useExtractDocumentText } from '../hooks/useExtractDocumentText';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface ImportFromDocumentProps {
  applicationId: string;
  /** Receives the extracted text. Only offered while the draft is empty (JEF-508). */
  onImport: (text: string) => void;
  disabled?: boolean;
}

/** "Start from" an uploaded document: its text becomes the draft's first version. */
export function ImportFromDocument({ applicationId, onImport, disabled }: ImportFromDocumentProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: documents } = useDocuments(applicationId);
  const extract = useExtractDocumentText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!documents || documents.length === 0) return null;

  const importDocument = async (documentId: string) => {
    setError(null);
    try {
      const text = await extract.mutateAsync(documentId);
      if (text.trim().length === 0) {
        setError(t('importEmpty'));
        return;
      }
      setOpen(false);
      onImport(text);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.container} testID="draft-import">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={disabled}
        hitSlop={8}
        testID="draft-import-toggle"
      >
        <Text style={styles.toggle}>{t('importTitle')}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          <Text style={styles.help}>{t('importHelp')}</Text>
          {documents.map((doc) => (
            <Pressable
              key={doc.id}
              style={[styles.option, (disabled || extract.isPending) && styles.disabled]}
              onPress={() => void importDocument(doc.id)}
              disabled={disabled || extract.isPending}
              testID={`draft-import-${doc.id}`}
            >
              <Text style={styles.optionText}>{doc.name}</Text>
            </Pressable>
          ))}
          {extract.isPending ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.help}>{t('importing')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} testID="draft-import-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
    toggle: { fontSize: 13, fontWeight: '600', color: colors.primary },
    list: { gap: 8 },
    help: { fontSize: 12, color: colors.textSubtle },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    option: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    optionText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
    disabled: { opacity: 0.5 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
  });
}
