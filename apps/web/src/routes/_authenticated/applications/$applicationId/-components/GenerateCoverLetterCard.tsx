import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { documentCategory } from '#/lib/documentCategory';
import { useLocale } from '#/lib/i18n';
import { Button, FormLabel, Select } from '@trakwyn/ui';
import { invalidateSectionCounts } from '../-sectionCounts';
import {
  documentDraftsQueryKey,
  documentDraftsQueryOptions,
  documentsQueryOptions,
} from '../-documentQueries';

const GENERATE_COVER_LETTER = `
  mutation GenerateCoverLetter($applicationId: ID!, $resumeDocumentId: ID, $resumeDraftId: ID) {
    generateCoverLetter(
      applicationId: $applicationId
      resumeDocumentId: $resumeDocumentId
      resumeDraftId: $resumeDraftId
    ) {
      id
      title
      createdAt
    }
  }
`;

const FILE_PREFIX = 'file:';
const DRAFT_PREFIX = 'draft:';

/**
 * The create-cover-letter form's generate block, the counterpart of the resume
 * form's (JEF-396): it writes from the profile saved in Settings and, if one is
 * chosen, one of *this application's* resumes — an uploaded file or a resume
 * draft. The choice is sent as an id and resolved on the server.
 */
export function GenerateCoverLetterCard({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [choice, setChoice] = useState('');
  const pickerId = useId();

  const { data: documentsData } = useQuery(documentsQueryOptions(applicationId));
  const { data: draftsData } = useQuery(documentDraftsQueryOptions(applicationId));
  const resumeFiles = (documentsData?.documents ?? []).filter(
    (d) => documentCategory(d.documentType) === 'resume',
  );
  const resumeDrafts = (draftsData?.documentDrafts ?? []).filter(
    (d) => documentCategory(d.type) === 'resume',
  );

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateCoverLetter: { id: string } }>(GENERATE_COVER_LETTER, {
        applicationId,
        resumeDocumentId: choice.startsWith(FILE_PREFIX) ? choice.slice(FILE_PREFIX.length) : null,
        resumeDraftId: choice.startsWith(DRAFT_PREFIX) ? choice.slice(DRAFT_PREFIX.length) : null,
      }),
    onSuccess: (result) => {
      // Saved as a draft, so the next step is the editor.
      void qc.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) });
      void invalidateSectionCounts(qc, applicationId);
      void navigate({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId, draftId: result.generateCoverLetter.id },
      });
    },
  });

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {t('documentDraft.generateCoverLetterTitle')}
      </p>
      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
        {t('documentDraft.generateCoverLetterHelp')}
      </p>

      <div className="mt-3">
        <FormLabel size="xs" htmlFor={pickerId}>
          {t('documentDraft.baseOnResumeLabel')}
        </FormLabel>
        <Select id={pickerId} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{t('documentDraft.noResumeOption')}</option>
          {resumeFiles.length > 0 && (
            <optgroup label={t('documentDraft.resumeFilesGroup')}>
              {resumeFiles.map((doc) => (
                <option key={doc.id} value={`${FILE_PREFIX}${doc.id}`}>
                  {doc.name}
                </option>
              ))}
            </optgroup>
          )}
          {resumeDrafts.length > 0 && (
            <optgroup label={t('documentDraft.resumeDraftsGroup')}>
              {resumeDrafts.map((draft) => (
                <option key={draft.id} value={`${DRAFT_PREFIX}${draft.id}`}>
                  {draft.title}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
      >
        {generate.isPending
          ? t('documentDraft.generatingCoverLetter')
          : `✨ ${t('documentDraft.generateCoverLetter')}`}
      </Button>

      {generate.isError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          <AiErrorMessage
            code={getGqlErrorCode(generate.error)}
            fallback={(generate.error as Error).message}
          />
        </p>
      )}
    </div>
  );
}
