import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

function NoteRow({
  note,
  onUpdate,
  onDelete,
  isSaving,
}: {
  note: Note;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('notes');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);

  if (isEditing) {
    return (
      <View style={styles.card} testID={`note-${note.id}`}>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          testID={`note-edit-input-${note.id}`}
        />
        <View style={styles.rowActions}>
          <Pressable
            onPress={() => {
              onUpdate(draft);
              setIsEditing(false);
            }}
            testID={`note-save-${note.id}`}
          >
            <Text style={styles.link}>{t('save')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDraft(note.content);
              setIsEditing(false);
            }}
          >
            <Text style={styles.linkMuted}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card} testID={`note-${note.id}`}>
      <Text style={styles.content}>{note.content}</Text>
      <View style={styles.rowActions}>
        <Pressable onPress={() => setIsEditing(true)} testID={`note-edit-${note.id}`}>
          <Text style={styles.link}>{t('edit')}</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert(t('deleteNoteTitle'), t('deleteNoteMessage'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive', onPress: onDelete },
            ])
          }
          disabled={isSaving}
          testID={`note-delete-${note.id}`}
        >
          <Text style={styles.linkDanger}>{t('delete')}</Text>
        </Pressable>
      </View>
    </View>
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

  const [draft, setDraft] = useState('');

  const onAdd = () => {
    const content = draft.trim();
    if (!content) return;
    createNote.mutate(content, {
      onSuccess: () => setDraft(''),
      onError: (err) => Alert.alert(t('couldNotAddNoteTitle'), getErrorMessage(err)),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="notes-loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={notes ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyText')}</Text>}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            isSaving={updateNote.isPending || deleteNote.isPending}
            onUpdate={(content) =>
              updateNote.mutate(
                { id: item.id, content },
                { onError: (err) => Alert.alert(t('couldNotSaveTitle'), getErrorMessage(err)) },
              )
            }
            onDelete={() =>
              deleteNote.mutate(item.id, {
                onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.addInput]}
          placeholder={t('addNotePlaceholder')}
          value={draft}
          onChangeText={setDraft}
          multiline
          testID="new-note-input"
        />
        <Pressable
          style={[styles.addButton, createNote.isPending && styles.addButtonDisabled]}
          onPress={onAdd}
          disabled={createNote.isPending}
          testID="add-note-button"
        >
          <Text style={styles.addButtonText}>{t('add')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    list: { padding: 16 },
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
    rowActions: { flexDirection: 'row', gap: 16 },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkMuted: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
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
    addRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'flex-end',
    },
    addInput: { flex: 1, minHeight: 44, maxHeight: 100 },
    addButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonDisabled: { opacity: 0.6 },
    addButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  });
}
