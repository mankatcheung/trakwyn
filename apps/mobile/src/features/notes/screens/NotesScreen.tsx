import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useNotes } from '../hooks/useNoteQueries';
import { useCreateNote, useDeleteNote, useUpdateNote } from '../hooks/useNoteMutations';
import type { Note } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { PencilIcon, TrashIcon } from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';

function NoteRow({
  note,
  onEdit,
  onDelete,
  isSaving,
}: {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('notes');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card} testID={`note-${note.id}`}>
      <Text style={styles.content}>{note.content}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.timestamp}>{new Date(note.updatedAt).toLocaleString()}</Text>
        <View style={styles.rowActions}>
          <IconButton
            icon={PencilIcon}
            onPress={onEdit}
            testID={`note-edit-${note.id}`}
            accessibilityLabel={t('edit')}
          />
          <IconButton
            icon={TrashIcon}
            variant="danger"
            onPress={() =>
              Alert.alert(t('deleteNoteTitle'), t('deleteNoteMessage'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('delete'), style: 'destructive', onPress: onDelete },
              ])
            }
            disabled={isSaving}
            testID={`note-delete-${note.id}`}
            accessibilityLabel={t('delete')}
          />
        </View>
      </View>
    </View>
  );
}

interface NoteFormModalProps {
  visible: boolean;
  initialContent: string;
  isSaving: boolean;
  onSubmit: (content: string) => void;
  onClose: () => void;
}

function NoteFormModal({
  visible,
  initialContent,
  isSaving,
  onSubmit,
  onClose,
}: NoteFormModalProps) {
  const { t } = useTranslation('notes');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState(initialContent);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="note-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID="note-modal-cancel">
            <Text style={styles.linkMuted}>{t('cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{initialContent ? t('edit') : t('add')}</Text>
          <Pressable
            onPress={() => onSubmit(draft.trim())}
            disabled={isSaving || !draft.trim()}
            testID="note-modal-save"
          >
            <Text style={[styles.link, (isSaving || !draft.trim()) && styles.linkDisabled]}>
              {t('save')}
            </Text>
          </Pressable>
        </View>
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.multiline, styles.modalInput]}
          placeholder={t('addNotePlaceholder')}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          testID="note-modal-input"
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function NotesScreen() {
  const { t } = useTranslation('notes');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: notes, isLoading, isError, error } = useNotes(applicationId);
  const createNote = useCreateNote(applicationId);
  const updateNote = useUpdateNote(applicationId);
  const deleteNote = useDeleteNote(applicationId);

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const isModalVisible = isAdding || editingNote !== null;
  const isSaving = createNote.isPending || updateNote.isPending;

  const closeModal = () => {
    setIsAdding(false);
    setEditingNote(null);
  };

  const onSubmit = (content: string) => {
    if (!content) return;
    if (editingNote) {
      updateNote.mutate(
        { id: editingNote.id, content },
        {
          onSuccess: closeModal,
          onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)),
        },
      );
      return;
    }
    createNote.mutate(content, {
      onSuccess: closeModal,
      onError: (err) => Alert.alert(t('couldNotAddNoteTitle'), getErrorMessage(err)),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} testID="notes-loading" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.error}>{getErrorMessage(error)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notes ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyText')}</Text>}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            isSaving={updateNote.isPending || deleteNote.isPending}
            onEdit={() => setEditingNote(item)}
            onDelete={() =>
              deleteNote.mutate(item.id, {
                onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <FloatingActionButton
        onPress={() => setIsAdding(true)}
        testID="add-note-button"
        accessibilityLabel={t('add')}
      />

      <NoteFormModal
        key={editingNote?.id ?? (isAdding ? 'add' : 'closed')}
        visible={isModalVisible}
        initialContent={editingNote?.content ?? ''}
        isSaving={isSaving}
        onSubmit={onSubmit}
        onClose={closeModal}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    list: { padding: 16, paddingTop: 4, paddingBottom: 96 },
    separator: { height: 10 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    content: { fontSize: 14, color: colors.text, lineHeight: 20 },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    timestamp: { fontSize: 12, color: colors.textFaint },
    rowActions: { flexDirection: 'row', gap: 4 },
    link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    linkDisabled: { color: colors.textFaint },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.surface,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    modalInput: { margin: 16, flex: 1 },
  });
}
