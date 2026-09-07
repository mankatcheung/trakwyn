import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { useExportUserData, useImportUserData } from '../hooks/useAccountData';
import { getErrorMessage } from '../../../lib/errors';
import type { ImportSummary } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function summaryText(summary: ImportSummary): string {
  const parts = [
    i18n.t('settings:data.applicationsImported', { count: summary.applicationsImported }),
    i18n.t('settings:data.notesImported', { count: summary.notesImported }),
  ];
  if (summary.applicationsSkipped > 0) {
    parts.push(i18n.t('settings:data.applicationsSkipped', { count: summary.applicationsSkipped }));
  }
  if (summary.documentsSkipped > 0) {
    parts.push(i18n.t('settings:data.documentsSkipped', { count: summary.documentsSkipped }));
  }
  return parts.join(', ');
}

export function DataScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const exportUserData = useExportUserData();
  const importUserData = useImportUserData();
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  const onExport = async () => {
    try {
      const json = await exportUserData.mutateAsync();
      await Share.share({ message: json, title: t('data.exportShareTitle') });
    } catch {
      // Silent — export errors are non-critical, matching apps/web.
    }
  };

  const onImport = async () => {
    setImportError(null);
    setImportResult(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    try {
      const text = await new File(result.assets[0].uri).text();
      const summary = await importUserData.mutateAsync(text);
      setImportResult(summary);
    } catch (err) {
      setImportError(getErrorMessage(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('data.exportTitle')}</Text>
        <Text style={styles.description}>{t('data.exportDescription')}</Text>
        <Pressable
          style={styles.button}
          onPress={onExport}
          disabled={exportUserData.isPending}
          testID="export-data-button"
        >
          {exportUserData.isPending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>{t('data.downloadExport')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{t('data.importTitle')}</Text>
        <Text style={styles.description}>{t('data.importDescription')}</Text>
        {importError ? <Text style={styles.error}>{importError}</Text> : null}
        {importResult ? (
          <Text style={styles.success} testID="import-result">
            {summaryText(importResult)}
          </Text>
        ) : null}
        <Pressable
          style={styles.button}
          onPress={onImport}
          disabled={importUserData.isPending}
          testID="import-data-button"
        >
          {importUserData.isPending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>{t('data.chooseFileToImport')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    description: { fontSize: 13, color: colors.textSubtle },
    button: {
      alignSelf: 'flex-start',
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    success: { color: '#047857', fontSize: 13 },
  });
}
