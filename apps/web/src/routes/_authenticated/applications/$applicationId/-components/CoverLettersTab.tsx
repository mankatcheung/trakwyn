import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { useLocale } from '#/lib/i18n';
import { Button, Card, FormLabel, Spinner, Textarea } from '@trakwyn/ui';
import { invalidateSectionCounts } from '../-sectionCounts';
import { documentDraftsQueryKey } from '../-documentQueries';
import { DocumentList } from './DocumentList';

const GENERATE_COVER_LETTER = `
  mutation GenerateCoverLetter($applicationId: ID!, $resumeText: String) {
    generateCoverLetter(applicationId: $applicationId, resumeText: $resumeText) {
      id
      title
      createdAt
    }
  }
`;

/**
 * The one place cover letters live: AI generation on top, then every cover
 * letter draft and uploaded file for this application (JEF-396).
 */
export function CoverLettersTab({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [resumeText, setResumeText] = useState('');

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateCoverLetter: { id: string } }>(GENERATE_COVER_LETTER, {
        applicationId,
        resumeText: resumeText.trim() || null,
      }),
    onSuccess: (result) => {
      // Generated letters are saved as drafts now, so the useful next step is
      // the editor rather than a copy button over throwaway text.
      void qc.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) });
      void invalidateSectionCounts(qc, applicationId);
      void navigate({
        to: '/applications/$applicationId/documents/$draftId',
        params: { applicationId, draftId: result.generateCoverLetter.id },
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <FormLabel>
            {t('coverLetter.resumeBackgroundLabel')}{' '}
            <span className="font-normal text-gray-400">
              ({t('coverLetter.optionalTailoredNote')})
            </span>
          </FormLabel>
          <Textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={6}
            placeholder={t('coverLetter.pastePlaceholder')}
          />
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          <span className="flex items-center gap-2">
            {generate.isPending ? (
              <>
                <Spinner tone="white" />
                {t('coverLetter.generating')}
              </>
            ) : (
              <>✨ {t('coverLetter.generateCoverLetter')}</>
            )}
          </span>
        </Button>
        {generate.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AiErrorMessage
              code={getGqlErrorCode(generate.error)}
              fallback={(generate.error as Error).message}
            />
          </p>
        )}
      </Card>

      <DocumentList applicationId={applicationId} category="cover_letter" />
    </div>
  );
}
