import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { GENERATE_COVER_LETTER_MUTATION } from '../graphql/coverLetterOperations';
import { documentDraftsQueryKey } from '../../documents/hooks/useDocumentDraftQueries';

interface GeneratedCoverLetter {
  id: string;
  title: string;
  createdAt: string;
}

/** At most one of this application's resumes; neither means the saved profile alone. */
export interface CoverLetterResumeSelection {
  resumeDocumentId?: string | null;
  resumeDraftId?: string | null;
}

export function useGenerateCoverLetter(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selection: CoverLetterResumeSelection = {}) =>
      gqlRequest<{ generateCoverLetter: GeneratedCoverLetter }>(GENERATE_COVER_LETTER_MUTATION, {
        applicationId,
        resumeDocumentId: selection.resumeDocumentId ?? null,
        resumeDraftId: selection.resumeDraftId ?? null,
      }).then((data) => data.generateCoverLetter),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) }),
  });
}
