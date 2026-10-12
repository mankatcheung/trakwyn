import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { proseToTiptapDoc } from '#/lib/proseToTiptapDoc';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, FormLabel, Input, Select } from '@trakwyn/ui';
import type { SectionId } from '../-sections';

const GENERATE_RESUME_MUTATION = `
  mutation GenerateResume($applicationId: ID!) {
    generateResume(applicationId: $applicationId) {
      id
      applicationId
    }
  }
`;

const CREATE_DRAFT_MUTATION = `
  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {
    createDocumentDraft(input: $input) {
      id
      applicationId
      type
      title
    }
  }
`;

const EXTRACT_TEXT_MUTATION = `
  mutation ExtractDocumentText($documentId: ID!) {
    extractDocumentText(documentId: $documentId) {
      text
    }
  }
`;

const DOCUMENTS_QUERY = `
  query Documents($applicationId: ID!) {
    documents(applicationId: $applicationId) {
      id
      name
      documentType
    }
  }
`;

export type DraftType = 'cover_letter' | 'resume';

/** Where Cancel returns to: the tab the draft would have landed in. */
const SECTION_BY_TYPE: Record<DraftType, SectionId> = {
  cover_letter: 'cover-letters',
  resume: 'resumes',
};

interface NewDraftFormProps {
  applicationId: string;
  /** Fixed by the route: the form never asks, and cannot be switched. */
  type: DraftType;
}

/**
 * The create-draft form behind both `cover-letters/new` and `resumes/new`.
 * Each route passes its own type, so there is nothing for the user to choose
 * (JEF-396); the resume form alone offers AI generation.
 */
export function NewDraftForm({ applicationId, type }: NewDraftFormProps) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [sourceDocumentId, setSourceDocumentId] = useState<string>('');
  const [documents, setDocuments] = useState<
    Array<{ id: string; name: string; documentType: string }>
  >([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = type === 'cover_letter' ? t('documents.cover_letter') : t('documents.resume');

  useEffect(() => {
    gqlClient
      .request<{ documents: Array<{ id: string; name: string; documentType: string }> }>(
        DOCUMENTS_QUERY,
        { applicationId },
      )
      .then((res) => setDocuments(res.documents))
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [applicationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let { contentJson, plainText } = proseToTiptapDoc('');

      if (sourceDocumentId) {
        const extractRes = await gqlClient.request<{ extractDocumentText: { text: string } }>(
          EXTRACT_TEXT_MUTATION,
          { documentId: sourceDocumentId },
        );
        ({ contentJson, plainText } = proseToTiptapDoc(extractRes.extractDocumentText.text));
      }

      const res = await gqlClient.request<{
        createDocumentDraft: { id: string; applicationId: string };
      }>(CREATE_DRAFT_MUTATION, {
        input: {
          applicationId,
          type,
          title: title || typeLabel,
          contentJson,
          plainText,
          sourceDocumentId: sourceDocumentId || null,
        },
      });

      await navigate({
        to: '/applications/$applicationId/documents/$draftId',
        params: {
          applicationId: res.createDocumentDraft.applicationId,
          draftId: res.createDocumentDraft.id,
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('documentDraft.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await gqlClient.request<{
        generateResume: { id: string; applicationId: string };
      }>(GENERATE_RESUME_MUTATION, { applicationId });
      await navigate({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId: res.generateResume.applicationId, draftId: res.generateResume.id },
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {type === 'cover_letter'
          ? t('documentDraft.newCoverLetterTitle')
          : t('documentDraft.newResumeTitle')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <FormLabel>{t('documentDraft.titleLabel')}</FormLabel>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={typeLabel}
          />
        </div>

        <div>
          <FormLabel>{t('documentDraft.startFromLabel')}</FormLabel>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {t('documentDraft.startFromHelp')}
          </p>
          {loadingDocs ? (
            <Select disabled>
              <option>{t('common.loading')}</option>
            </Select>
          ) : (
            <Select value={sourceDocumentId} onChange={(e) => setSourceDocumentId(e.target.value)}>
              <option value="">{t('documentDraft.blankOption')}</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name} ({doc.documentType})
                </option>
              ))}
            </Select>
          )}
        </div>

        {type === 'resume' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('documentDraft.generateResumeTitle')}
            </p>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              {t('documentDraft.generateResumeHelp')}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => void handleGenerate()}
              disabled={loading}
            >
              {loading ? t('documentDraft.generating') : `✨ ${t('documentDraft.generateResume')}`}
            </Button>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate({
                to: '/applications/$applicationId',
                params: { applicationId },
                search: { section: SECTION_BY_TYPE[type] },
              })
            }
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? t('documentDraft.creating') : t('documentDraft.createDraft')}
          </Button>
        </div>
      </form>
    </div>
  );
}
