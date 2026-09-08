import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocumentDraft } from '../hooks/useDocumentDraftQueries';
import { useUpdateDocumentDraftContent } from '../hooks/useUpdateDocumentDraftContent';
import { useRenameDocumentDraft } from '../hooks/useRenameDocumentDraft';
import { useDeleteDocumentDraft } from '../hooks/useDeleteDocumentDraft';
import { useExportDocumentDraftToPdf } from '../hooks/useExportDocumentDraftToPdf';
import { proseToTiptapDoc } from '../../../lib/proseToTiptapDoc';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback';
import { toggleLinePrefix, wrapSelection, type Selection } from '../lib/markdownEditing';
import { timeAgo } from '../../notifications/lib/timeAgo';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const AUTOSAVE_DELAY_MS = 1000;

export function DocumentDraftEditorScreen() {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId, draftId } = useLocalSearchParams<{ id: string; draftId: string }>();

  const { data: draft, isLoading, isError, error } = useDocumentDraft(draftId);
  const updateContent = useUpdateDocumentDraftContent();
  const renameDraft = useRenameDocumentDraft();
  const deleteDraft = useDeleteDocumentDraft(applicationId);
  const exportPdf = useExportDocumentDraftToPdf(applicationId);

  const [text, setText] = useState('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [syncedDraftId, setSyncedDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  if (draft && draft.id !== syncedDraftId) {
    setSyncedDraftId(draft.id);
    setText(draft.plainText);
    setLastSavedAt(draft.updatedAt);
  }

  const debouncedSave = useDebouncedCallback((value: string) => {
    if (!draft) return;
    const { contentJson, plainText } = proseToTiptapDoc(value);
    updateContent.mutate(
      { draftId: draft.id, contentJson, plainText },
      {
        onSuccess: (result) => setLastSavedAt(result.updatedAt),
        onError: (err) => setSaveError(getErrorMessage(err)),
      },
    );
  }, AUTOSAVE_DELAY_MS);

  const onChangeText = (value: string) => {
    setText(value);
    setSaveError(null);
    debouncedSave(value);
  };

  const applyEdit = (edit: { text: string; selection: Selection }) => {
    onChangeText(edit.text);
    setSelection(edit.selection);
  };

  const commitRename = () => {
    const title = titleDraft.trim();
    setRenaming(false);
    if (!draft || !title || title === draft.title) return;
    renameDraft.mutate(
      { draftId: draft.id, title },
      { onError: (err) => setSaveError(getErrorMessage(err)) },
    );
  };

  const handleDelete = () => {
    if (!draft) return;
    Alert.alert(t('deleteConfirm'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () =>
          deleteDraft.mutate(draft.id, {
            onSuccess: () => router.back(),
            onError: (err) => Alert.alert(t('deleteFailed'), getErrorMessage(err)),
          }),
      },
    ]);
  };

  const handleExport = () => {
    if (!draft) return;
    exportPdf.mutate(draft.id, {
      onSuccess: () => router.back(),
      onError: (err) => Alert.alert(t('exportFailed'), getErrorMessage(err)),
    });
  };

  const busy = exportPdf.isPending || deleteDraft.isPending;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="draft-loading" />
      </View>
    );
  }

  if (isError || !draft) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{isError ? getErrorMessage(error) : t('draftNotFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: draft.title,
          headerRight: () =>
            updateContent.isPending ? (
              <Text style={styles.savingText}>{t('savingEllipsis')}</Text>
            ) : (
              <Text style={styles.savedText}>{`✓ ${t('saved')}`}</Text>
            ),
        }}
      />

      <View style={styles.metaRow}>
        <View style={styles.metaRowStart}>
          <View
            style={[
              styles.typeBadge,
              draft.type === 'cover_letter' ? styles.typeBadgeCoverLetter : styles.typeBadgeResume,
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                draft.type === 'cover_letter'
                  ? styles.typeBadgeTextCoverLetter
                  : styles.typeBadgeTextResume,
              ]}
            >
              {draft.type === 'cover_letter' ? t('cover_letter') : t('resume')}
            </Text>
          </View>
          {renaming ? (
            <TextInput
              autoFocus
              style={styles.renameInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              testID="draft-rename-input"
            />
          ) : (
            <Pressable
              onPress={() => {
                setTitleDraft(draft.title);
                setRenaming(true);
              }}
              testID="draft-rename-trigger"
            >
              <Text style={styles.editedText}>
                {lastSavedAt ? `${t('editedPrefix')} ${timeAgo(lastSavedAt)}` : ''}
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.metaRowActions}>
          <Pressable
            onPress={() => void handleExport()}
            disabled={busy}
            hitSlop={8}
            testID="draft-export-button"
          >
            <Text style={[styles.headerActionText, busy && styles.disabledText]}>
              {exportPdf.isPending ? t('exporting') : t('exportPdf')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            disabled={busy}
            hitSlop={8}
            testID="draft-delete-button"
          >
            <Text style={[styles.headerActionTextDanger, busy && styles.disabledText]}>
              {t('delete')}
            </Text>
          </Pressable>
        </View>
      </View>

      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <View style={styles.toolbar}>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(wrapSelection(text, selection, '**'))}
          testID="toolbar-bold"
        >
          <Text style={styles.toolbarButtonTextBold}>B</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(wrapSelection(text, selection, '*'))}
          testID="toolbar-italic"
        >
          <Text style={styles.toolbarButtonTextItalic}>I</Text>
        </Pressable>
        <View style={styles.toolbarDivider} />
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(toggleLinePrefix(text, selection, '# '))}
          testID="toolbar-h1"
        >
          <Text style={styles.toolbarButtonText}>H1</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(toggleLinePrefix(text, selection, '## '))}
          testID="toolbar-h2"
        >
          <Text style={styles.toolbarButtonText}>H2</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(toggleLinePrefix(text, selection, '### '))}
          testID="toolbar-h3"
        >
          <Text style={styles.toolbarButtonText}>H3</Text>
        </Pressable>
        <View style={styles.toolbarDivider} />
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(toggleLinePrefix(text, selection, '- '))}
          testID="toolbar-bullet-list"
        >
          <Text style={styles.toolbarButtonText}>{'• ≡'}</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => applyEdit(toggleLinePrefix(text, selection, '1. '))}
          testID="toolbar-ordered-list"
        >
          <Text style={styles.toolbarButtonText}>{'1. ≡'}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.editor}
          multiline
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          placeholder={t('editorPlaceholder')}
          placeholderTextColor={colors.textFaint}
          testID="draft-content-input"
        />
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      margin: 16,
      marginBottom: 0,
      fontSize: 14,
    },
    savedText: { fontSize: 13, fontWeight: '600', color: '#16a34a' },
    savingText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    headerActionText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    headerActionTextDanger: { fontSize: 13, fontWeight: '600', color: colors.danger },
    disabledText: { opacity: 0.5 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    metaRowStart: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    metaRowActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 0 },
    typeBadge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
    typeBadgeCoverLetter: { backgroundColor: colors.primarySurface },
    typeBadgeResume: { backgroundColor: colors.surfaceAlt },
    typeBadgeText: { fontSize: 12, fontWeight: '600' },
    typeBadgeTextCoverLetter: { color: colors.primary },
    typeBadgeTextResume: { color: colors.textMuted },
    editedText: { fontSize: 12, color: colors.textFaint },
    renameInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingVertical: 2,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    toolbarButton: {
      minWidth: 32,
      height: 32,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    toolbarButtonText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    toolbarButtonTextBold: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
    toolbarButtonTextItalic: {
      fontSize: 14,
      fontWeight: '700',
      fontStyle: 'italic',
      color: colors.textMuted,
    },
    toolbarDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },
    editorScroll: { flex: 1 },
    editor: {
      flex: 1,
      minHeight: 360,
      padding: 16,
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
      textAlignVertical: 'top',
    },
  });
}
