import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { GENERATE_COVER_LETTER_MUTATION } from '../graphql/coverLetterOperations';
import { documentDraftsQueryKey } from '../../documents/hooks/useDocumentDraftQueries';

interface GeneratedCoverLetter {
  id: string;
  title: string;
  createdAt: string;
}

export function useGenerateCoverLetter(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeText: string | null) =>
      gqlRequest<{ generateCoverLetter: GeneratedCoverLetter }>(GENERATE_COVER_LETTER_MUTATION, {
        applicationId,
        resumeText,
      }).then((data) => data.generateCoverLetter),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) }),
  });
}
