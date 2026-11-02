import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { showUndoToast } from '#/lib/undoToast';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Card, Textarea } from '@trakwyn/ui';
import { QuotaHint } from '#/components/QuotaHint';
import { useQuotaState } from '#/lib/contentQuota';
import { invalidateSectionCounts } from '../-sectionCounts';

const NOTES_QUERY = `
  query Notes($applicationId: ID!) {
    notes(applicationId: $applicationId) { id applicationId content createdAt updatedAt }
  }
`;
const CREATE_NOTE = `
  mutation CreateNote($applicationId: ID!, $content: String!) {
    createNote(applicationId: $applicationId, content: $content) { id applicationId content createdAt updatedAt }
  }
`;
const UPDATE_NOTE = `
  mutation UpdateNote($id: ID!, $content: String!) {
    updateNote(id: $id, content: $content) { id applicationId content createdAt updatedAt }
  }
`;
const DELETE_NOTE = `mutation DeleteNote($id: ID!) { deleteNote(id: $id) }`;

export type Note = {
  id: string;
  applicationId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

interface NotesTabProps {
  applicationId: string;
  /** False while the application is unresolved or trashed — see the detail page. */
  enabled: boolean;
}

/**
 * Lifted out of `ApplicationDetailPage` when the section index landed
 * (JEF-208): it was the one section still inlined in the page, and it brought
 * four operations, two optimistic caches and an edit-in-place state with it.
 * Every other section already lived in its own file.
 */
export function NotesTab({ applicationId, enabled }: NotesTabProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [noteContent, setNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const { data, isError, error } = useQuery({
    queryKey: ['notes', applicationId],
    queryFn: () => gqlClient.request<{ notes: Note[] }>(NOTES_QUERY, { applicationId }),
    enabled,
  });
  const notes = data?.notes ?? [];
  const notesFull = useQuotaState('notes', notes.length)?.level === 'full';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notes', applicationId] });
    invalidateSectionCounts(qc, applicationId);
  };

  const createNote = useMutation({
    mutationFn: (content: string) => gqlClient.request(CREATE_NOTE, { applicationId, content }),
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: ['notes', applicationId] });
      const prevNotes = qc.getQueryData<{ notes: Note[] }>(['notes', applicationId]);
      const optimistic: Note = {
        id: `__tmp_${Date.now()}`,
        applicationId,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<{ notes: Note[] }>(['notes', applicationId], (old) => ({
        notes: [...(old?.notes ?? []), optimistic],
      }));
      return { prevNotes };
    },
    onError: (_err, _content, context) => {
      if (context?.prevNotes) qc.setQueryData(['notes', applicationId], context.prevNotes);
    },
    onSuccess: () => setNoteContent(''),
    onSettled: invalidate,
  });

  const updateNote = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      gqlClient.request(UPDATE_NOTE, { id, content }),
    onMutate: async ({ id, content }) => {
      await qc.cancelQueries({ queryKey: ['notes', applicationId] });
      const prevNotes = qc.getQueryData<{ notes: Note[] }>(['notes', applicationId]);
      qc.setQueryData<{ notes: Note[] }>(['notes', applicationId], (old) => ({
        notes: (old?.notes ?? []).map((n) =>
          n.id === id ? { ...n, content, updatedAt: new Date().toISOString() } : n,
        ),
      }));
      return { prevNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevNotes) qc.setQueryData(['notes', applicationId], context.prevNotes);
    },
    onSuccess: () => setEditingNote(null),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notes', applicationId] }),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="h-24"
          placeholder={t('applicationDetail.addNotePlaceholder')}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <QuotaHint resource="notes" used={notes.length} />
            {createNote.isError && (
              <p role="alert" className="text-xs text-red-600">
                {getErrorMessage(createNote.error)}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (noteContent.trim()) createNote.mutate(noteContent.trim());
            }}
            disabled={!noteContent.trim() || createNote.isPending || notesFull}
            aria-label={t('applicationDetail.addNote')}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon size={14} />{' '}
            <span className="hidden sm:inline">{t('applicationDetail.addNote')}</span>
          </button>
        </div>
      </Card>

      {isError && (
        <p className="py-2 text-sm text-red-600 dark:text-red-400">{getErrorMessage(error)}</p>
      )}

      {notes.map((note) => (
        <Card key={note.id} className="p-4">
          {editingNote?.id === note.id ? (
            <>
              <Textarea
                value={editingNote.content}
                onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                className="h-24"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => updateNote.mutate({ id: note.id, content: editingNote.content })}
                  aria-label={t('common.save')}
                  className="flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white"
                >
                  <CheckIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('common.save')}</span>
                </button>
                <button
                  onClick={() => setEditingNote(null)}
                  aria-label={t('common.cancel')}
                  className="flex cursor-pointer items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <XIcon size={14} /> <span className="hidden sm:inline">{t('common.cancel')}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-between gap-3">
              <p className="flex-1 text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {note.content}
              </p>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditingNote(note)}
                  aria-label={t('common.edit')}
                  className="cursor-pointer rounded-sm p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <EditIcon size={14} />
                </button>
                <button
                  onClick={() => {
                    const snapshot = qc.getQueryData<{ notes: Note[] }>(['notes', applicationId]);
                    qc.setQueryData<{ notes: Note[] }>(['notes', applicationId], (prev) => ({
                      notes: (prev?.notes ?? []).filter((n) => n.id !== note.id),
                    }));
                    showUndoToast({
                      message: t('applicationDetail.noteDeletedToast'),
                      operation: { document: DELETE_NOTE, variables: { id: note.id } },
                      onUndo: () => qc.setQueryData(['notes', applicationId], snapshot),
                      onSettled: invalidate,
                    });
                  }}
                  aria-label={t('common.delete')}
                  className="cursor-pointer rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}
