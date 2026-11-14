import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRenameDocumentDraft } from '../hooks/useRenameDocumentDraft';
import { useDeleteDocumentDraft } from '../hooks/useDeleteDocumentDraft';
import { useExportDocumentDraftToPdf } from '../hooks/useExportDocumentDraftToPdf';
import { useDraftSaver } from '../hooks/useDraftSaver';
import { useDraftAiHelper } from '../hooks/useDraftAiHelper';
import { useSelectionAi } from '../hooks/useSelectionAi';
import { DraftHistorySheet } from '../components/DraftHistorySheet';
import { SelectionAiBar } from '../components/SelectionAiBar';
import { AiHelperSheet } from '../components/AiHelperSheet';
import { DraftStatusBar } from '../components/DraftStatusBar';
import { DraftFormattingToolbar } from '../components/DraftFormattingToolbar';
import { ImportFromDocument } from '../components/ImportFromDocument';
import type { ResumeChoice } from '../components/ResumeSourcePicker';
import { markdownToTiptapDoc } from '../lib/markdownToTiptapDoc';
import { draftToMarkdown } from '../lib/tiptapToMarkdown';
import { useDebouncedCallback } from '../../../hooks/useDebouncedCallback';
import type { Selection, TextEdit } from '../lib/markdownEditing';
import { timeAgo } from '../../notifications/lib/timeAgo';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { DocumentDraftType, RestoredDraft } from '../types';

const AUTOSAVE_DELAY_MS = 1000;

export function DocumentDraftEditorScreen() {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId, draftId } = useLocalSearchParams<{ id: string; draftId: string }>();

  const { data: draft, isLoading, isError, error } = useDocumentDraft(draftId);
  const renameDraft = useRenameDocumentDraft();
  const deleteDraft = useDeleteDocumentDraft(applicationId);
  const exportPdf = useExportDocumentDraftToPdf(applicationId);
  const saver = useDraftSaver(draft?.id);

  const [text, setText] = useState('');
  // The text on screen right now, for callbacks that outlive a render (autosave, AI results).
  const textRef = useRef('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [syncedDraftId, setSyncedDraftId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [instructions, setInstructions] = useState('');
  const [helperOpen, setHelperOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Edits not yet sent to the server: what History must settle before it acts.
  const dirtyRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // A draft with formatting Markdown cannot show (alignment, highlight, ...) is not
  // autosaved until the user chooses to edit it anyway (JEF-586).
  const [lossy, setLossy] = useState(false);
  const [editAnyway, setEditAnyway] = useState(false);
  const saveBlocked = lossy && !editAnyway;
  const saveBlockedRef = useRef(false);

  if (draft && draft.id !== syncedDraftId) {
    setSyncedDraftId(draft.id);
    const opened = draftToMarkdown(draft);
    setText(opened.markdown);
    setLossy(opened.lossy);
    setEditAnyway(false);
    setTitleDraft(draft.title);
    setInstructions(draft.aiInstructions ?? '');
    saver.setLastSavedAt(draft.updatedAt);
  }

  // The draft loading (not a keystroke) also sets `text`; keep the ref level with it.
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    saveBlockedRef.current = saveBlocked;
  }, [saveBlocked]);

  const applyText = (value: string) => {
    textRef.current = value;
    setText(value);
  };

  const saveText = async (value: string) => {
    const { contentJson, plainText } = markdownToTiptapDoc(value);
    const saved = await saver.save({ contentJson, plainText });
    if (saved && textRef.current === value) dirtyRef.current = false;
    return saved;
  };

  // Reads the latest text when it fires, not the text it was scheduled with: an AI
  // result written in the meantime must not be overwritten by an older keystroke.
  const debouncedSave = useDebouncedCallback(() => {
    if (!saveBlockedRef.current && dirtyRef.current) void saveText(textRef.current);
  }, AUTOSAVE_DELAY_MS);

  const onChangeText = (value: string) => {
    dirtyRef.current = true;
    applyText(value);
    saver.clearError();
    debouncedSave();
  };

  const applyEdit = (edit: TextEdit) => {
    onChangeText(edit.text);
    setSelection(edit.selection);
  };

  const ai = useDraftAiHelper({
    draftId: draft?.id ?? '',
    type: (draft?.type ?? 'resume') as DocumentDraftType,
    getText: () => textRef.current,
    setText: applyText,
    saver,
  });

  const selectionAi = useSelectionAi({
    draftId: draft?.id ?? '',
    getText: () => textRef.current,
    applyEdit,
  });
  const hasSelection = selection.start !== selection.end;

  /** Sends any edit still waiting out the autosave debounce; false if that save failed. */
  const settleForHistory = async () => {
    if (saveBlockedRef.current || !dirtyRef.current) return true;
    return saveText(textRef.current);
  };

  const onHistoryRestored = (restored: RestoredDraft) => {
    const opened = draftToMarkdown(restored);
    dirtyRef.current = false;
    applyText(opened.markdown);
    setSelection({ start: 0, end: 0 });
    setLossy(opened.lossy);
    setEditAnyway(false);
    saver.clearError();
    saver.setLastSavedAt(restored.updatedAt);
  };

  const commitRename = () => {
    const title = titleDraft.trim();
    if (!draft || !title || title === draft.title) {
      if (draft) setTitleDraft(draft.title);
      return;
    }
    renameDraft.mutate(
      { draftId: draft.id, title },
      { onError: (err) => setActionError(getErrorMessage(err)) },
    );
  };

  const importText = (imported: string) => {
    onChangeText(imported);
    if (!saveBlocked) void saveText(imported);
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
  const hasText = text.trim().length > 0;
  const bannerError = saver.error ?? actionError;

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

  const isCoverLetter = draft.type === 'cover_letter';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: draft.title,
        }}
      />

      <TextInput
        style={styles.titleInput}
        value={titleDraft}
        onChangeText={setTitleDraft}
        onBlur={commitRename}
        onSubmitEditing={commitRename}
        placeholder={t(isCoverLetter ? 'cover_letter' : 'resume')}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={t('titleLabel')}
        returnKeyType="done"
        testID="draft-title-input"
      />

      <View style={styles.metaRow}>
        <View style={styles.metaRowStart}>
          <View
            style={[
              styles.typeBadge,
              isCoverLetter ? styles.typeBadgeCoverLetter : styles.typeBadgeResume,
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                isCoverLetter ? styles.typeBadgeTextCoverLetter : styles.typeBadgeTextResume,
              ]}
            >
              {isCoverLetter ? t('cover_letter') : t('resume')}
            </Text>
          </View>
          <Text style={styles.editedText}>
            {saver.lastSavedAt ? `${t('editedPrefix')} ${timeAgo(saver.lastSavedAt)}` : ''}
          </Text>
        </View>
        <View style={styles.metaRowActions}>
          <Pressable
            onPress={() => setHelperOpen(true)}
            disabled={saveBlocked}
            hitSlop={8}
            testID="ai-helper-open"
          >
            <Text
              style={[styles.headerActionText, saveBlocked && styles.disabledText]}
            >{`✨ ${t('aiTitle')}`}</Text>
          </Pressable>
          <Pressable
            onPress={() => setHistoryOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            testID="draft-history-open"
          >
            <Text style={styles.headerActionText}>{t('historyOpen')}</Text>
          </Pressable>
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

      {bannerError ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText} testID="draft-save-error">
            {bannerError}
          </Text>
        </View>
      ) : null}

      {saveBlocked ? (
        <View style={styles.lossyRow} testID="draft-lossy-banner">
          <Text style={styles.lossyText}>{t('lossyBanner')}</Text>
          <Pressable
            onPress={() => setEditAnyway(true)}
            hitSlop={8}
            accessibilityRole="button"
            testID="draft-lossy-edit-anyway"
          >
            <Text style={styles.headerActionText}>{t('lossyEditAnyway')}</Text>
          </Pressable>
        </View>
      ) : null}

      {hasText || !applicationId ? null : (
        <ImportFromDocument
          applicationId={applicationId}
          onImport={importText}
          disabled={ai.running}
        />
      )}

      <DraftFormattingToolbar
        text={text}
        selection={selection}
        onEdit={applyEdit}
        disabled={ai.running || selectionAi.running}
      />

      {!saveBlocked && (hasSelection || selectionAi.state.phase !== 'idle') ? (
        <SelectionAiBar
          state={selectionAi.state}
          disabled={ai.running}
          onRun={(request) => void selectionAi.run(request, selection)}
          onAsk={() => selectionAi.openAsk(selection)}
          onAccept={selectionAi.accept}
          onDismiss={selectionAi.dismiss}
        />
      ) : null}

      <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.editor}
          multiline
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          placeholder={t('editorPlaceholder')}
          placeholderTextColor={colors.textFaint}
          // Read-only while the AI answers, so nothing typed is lost under its result.
          editable={!ai.running && !selectionAi.running}
          testID="draft-content-input"
          spellCheck
          autoCorrect
          autoCapitalize="sentences"
        />
      </ScrollView>

      <DraftStatusBar
        text={text}
        selection={selection}
        saving={saver.saving}
        failed={saver.error !== null}
        hasSaved={saver.lastSavedAt !== null}
        onRetry={() => void saver.retry()}
      />

      <DraftHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        draftId={draft.id}
        prepare={settleForHistory}
        onRestored={onHistoryRestored}
      />

      <AiHelperSheet
        visible={helperOpen}
        onClose={() => setHelperOpen(false)}
        applicationId={applicationId}
        type={draft.type as DocumentDraftType}
        hasText={hasText}
        instructions={instructions}
        onInstructionsChange={setInstructions}
        running={ai.running}
        failure={ai.failure}
        suggestion={ai.suggestion}
        currentText={text}
        onGenerate={async (resume: ResumeChoice | null) => {
          // Stays open while it runs, so a failure shows where the button was pressed.
          if (await ai.generate(instructions, resume)) setHelperOpen(false);
        }}
        onPolish={() => void ai.polish(instructions)}
        onReplace={() => {
          setHelperOpen(false);
          void ai.replace(instructions);
        }}
        onInsertBelow={() => {
          setHelperOpen(false);
          void ai.insertBelow(instructions);
        }}
        onDiscard={ai.discard}
      />
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
    titleInput: {
      marginHorizontal: 16,
      marginTop: 14,
      paddingVertical: 6,
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      margin: 16,
      marginBottom: 0,
    },
    lossyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 10,
      margin: 16,
      marginBottom: 0,
    },
    lossyText: { flex: 1, color: colors.text, fontSize: 14 },
    errorText: { flex: 1, color: colors.danger, fontSize: 14 },
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
