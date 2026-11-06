import { useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FormLabel, Select } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { proseToTiptapDoc } from '#/lib/proseToTiptapDoc';
import type { TiptapNode } from '#/lib/markdownToTiptapDoc';
import { documentsQueryOptions } from '../-documentQueries';
import type { DocumentEditorHandle } from './DocumentDraftEditor';

const EXTRACT_TEXT_MUTATION = `
  mutation ExtractDocumentText($documentId: ID!) {
    extractDocumentText(documentId: $documentId) {
      text
    }
  }
`;

interface ImportDocumentActionProps {
  applicationId: string;
  editorRef: RefObject<DocumentEditorHandle | null>;
  /** Saves what the editor now shows. Resolves to whether it was saved. */
  onSave: (contentJson: string, plainText: string) => Promise<boolean>;
}

/**
 * Starts an empty draft from the text of one of the application's documents
 * (it was "Start from" on the old new-draft page). The page shows it only while
 * the draft is empty. Renders nothing when the application has no documents.
 */
export function ImportDocumentAction({
  applicationId,
  editorRef,
  onSave,
}: ImportDocumentActionProps) {
  const { t } = useLocale();
  const { data } = useQuery(documentsQueryOptions(applicationId));
  const [documentId, setDocumentId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const documents = data?.documents ?? [];
  if (documents.length === 0) return null;

  const run = async () => {
    const editor = editorRef.current;
    if (!editor || !documentId) return;
    setRunning(true);
    setError(null);
    editor.setEditable(false);
    try {
      const res = await gqlClient.request<{ extractDocumentText: { text: string } }>(
        EXTRACT_TEXT_MUTATION,
        { documentId },
      );
      const { contentJson, plainText } = proseToTiptapDoc(res.extractDocumentText.text);
      if (!plainText) {
        setError(t('documentDraftEdit.importEmpty'));
        return;
      }
      const nodes = (JSON.parse(contentJson) as { content: TiptapNode[] }).content;
      editor.replaceContent(nodes);
      if (!(await onSave(editor.getJson(), editor.getText()))) {
        setError(t('aiHelper.saveFailed'));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      editor.setEditable(true);
      setRunning(false);
    }
  };

  return (
    <section
      aria-label={t('documentDraftEdit.importTitle')}
      className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('documentDraftEdit.importTitle')}
        </h2>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
          {t('documentDraftEdit.importHelp')}
        </p>
      </div>
      <div>
        <FormLabel size="xs" htmlFor="import-document">
          {t('documentDraftEdit.importLabel')}
        </FormLabel>
        <Select
          id="import-document"
          value={documentId}
          disabled={running}
          onChange={(e) => setDocumentId(e.target.value)}
        >
          <option value="">{t('documentDraftEdit.importChoose')}</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.name} ({doc.documentType})
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!documentId || running}
        onClick={() => void run()}
      >
        {t(running ? 'documentDraftEdit.importing' : 'documentDraftEdit.importAction')}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
