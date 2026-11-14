import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Markdown } from '../../../components/Markdown';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import {
  useCreateDraftVersion,
  useDraftVersion,
  useDraftVersions,
  useRestoreDraftVersion,
} from '../hooks/useDraftHistory';
import { draftToMarkdown } from '../lib/tiptapToMarkdown';
import type { DraftVersionSource, RestoredDraft } from '../types';

interface DraftHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  draftId: string;
  /**
   * Sends any edit still waiting out the autosave debounce and waits for it.
   * Resolves false when the save failed: a version or restore must not run
   * against content the server never received.
   */
  prepare: () => Promise<boolean>;
  /** The server restored a version; the editor takes its content. */
  onRestored: (draft: RestoredDraft) => void;
}

const SOURCE_KEYS: Record<DraftVersionSource, string> = {
  autosave: 'historySourceAutosave',
  ai: 'historySourceAi',
  manual: 'historySourceManual',
  restore: 'historySourceRestore',
};

/**
 * Draft history (JEF-588): the versions kept of this draft (including the ones
 * web and the AI actions made), a read-only preview of one, Restore with a
 * confirmation, and Save version. A bottom sheet, so the editor stays loaded.
 */
export function DraftHistorySheet({
  visible,
  onClose,
  draftId,
  prepare,
  onRestored,
}: DraftHistorySheetProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const versions = useDraftVersions(draftId, visible);
  const preview = useDraftVersion(selectedId);
  const createVersion = useCreateDraftVersion(draftId);
  const restoreVersion = useRestoreDraftVersion(draftId);
  const busy = createVersion.isPending || restoreVersion.isPending;

  const afterSettling = async (action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      if (!(await prepare())) {
        setError(t('historyUnsaved'));
        return;
      }
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const saveVersion = () =>
    afterSettling(async () => {
      await createVersion.mutateAsync();
      setNotice(t('historySaved'));
    });

  const restore = (versionId: string) =>
    afterSettling(async () => {
      const restored = await restoreVersion.mutateAsync(versionId);
      setSelectedId(null);
      onRestored(restored);
      onClose();
    });

  const confirmRestore = (versionId: string) =>
    Alert.alert(t('historyRestoreConfirm'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('historyRestore'), onPress: () => void restore(versionId) },
    ]);

  const previewMarkdown = preview.data ? draftToMarkdown(preview.data).markdown : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="draft-history-backdrop" />
      <View style={styles.sheet} testID="draft-history-sheet">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('historyTitle')}</Text>
            <Pressable
              style={[styles.secondary, busy && styles.disabled]}
              onPress={() => void saveVersion()}
              disabled={busy}
              accessibilityRole="button"
              testID="draft-history-save"
            >
              <Text style={styles.secondaryText}>{t('historySave')}</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.error} testID="draft-history-error">
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text style={styles.notice} testID="draft-history-notice">
              {notice}
            </Text>
          ) : null}

          {versions.isLoading ? (
            <ActivityIndicator color={colors.primary} testID="draft-history-loading" />
          ) : null}
          {versions.isError ? (
            <Text style={styles.error} testID="draft-history-load-error">
              {getErrorMessage(versions.error)}
            </Text>
          ) : null}
          {versions.data?.length === 0 ? (
            <Text style={styles.help} testID="draft-history-empty">
              {t('historyEmpty')}
            </Text>
          ) : null}

          {versions.data?.map((version) => (
            <Pressable
              key={version.id}
              style={[styles.row, selectedId === version.id && styles.rowSelected]}
              onPress={() => setSelectedId(version.id === selectedId ? null : version.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === version.id }}
              testID={`draft-history-version-${version.id}`}
            >
              <Text style={styles.rowTitle}>{t(SOURCE_KEYS[version.source])}</Text>
              <Text style={styles.rowMeta}>
                {`${new Date(version.createdAt).toLocaleString()} · ${t('historyCharacters', {
                  count: version.characterCount,
                  formatted: version.characterCount.toLocaleString(),
                })}`}
              </Text>
            </Pressable>
          ))}

          {selectedId ? (
            <View style={styles.preview} testID="draft-history-preview">
              <Text style={styles.label}>{t('historyPreview')}</Text>
              {preview.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {preview.isError ? (
                <Text style={styles.error}>{getErrorMessage(preview.error)}</Text>
              ) : null}
              {preview.data ? (
                <>
                  <ScrollView style={styles.previewBody} nestedScrollEnabled>
                    <Markdown content={previewMarkdown} />
                  </ScrollView>
                  <Pressable
                    style={[styles.primary, busy && styles.disabled]}
                    onPress={() => confirmRestore(preview.data.id)}
                    disabled={busy}
                    accessibilityRole="button"
                    testID="draft-history-restore"
                  >
                    <Text style={styles.primaryText}>{t('historyRestore')}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={styles.secondary}
            onPress={onClose}
            accessibilityRole="button"
            testID="draft-history-close"
          >
            <Text style={styles.secondaryText}>{tCommon('close')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      maxHeight: '80%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    content: { padding: 16, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    help: { fontSize: 14, color: colors.textMuted },
    label: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    notice: { color: colors.success, fontSize: 14, fontWeight: '600' },
    row: { borderRadius: 8, padding: 10, backgroundColor: colors.surfaceAlt, gap: 2 },
    rowSelected: { borderWidth: 1, borderColor: colors.primary },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textFaint },
    preview: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    previewBody: { maxHeight: 240 },
    primary: {
      alignItems: 'center',
      borderRadius: 8,
      paddingVertical: 11,
      backgroundColor: colors.primary,
    },
    primaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 15 },
    secondary: {
      alignItems: 'center',
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryText: { color: colors.text, fontWeight: '600', fontSize: 14 },
    disabled: { opacity: 0.5 },
  });
}
