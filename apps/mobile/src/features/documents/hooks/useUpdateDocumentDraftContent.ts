import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { RESUME_MATCHES_KEY_PREFIX } from '../../applications/hooks/useResumeMatchQueries';
import { RESUME_ATS_SCORES_KEY_PREFIX } from '../../applications/hooks/useResumeAtsQueries';
import { UPDATE_DOCUMENT_DRAFT_CONTENT_MUTATION } from '../graphql/draftOperations';

export interface UpdateDocumentDraftContentInput {
  draftId: string;
  contentJson: string;
  plainText: string;
}

export function useUpdateDocumentDraftContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDocumentDraftContentInput) =>
      gqlRequest<{ updateDocumentDraftContent: { id: string; updatedAt: string } }>(
        UPDATE_DOCUMENT_DRAFT_CONTENT_MUTATION,
        { input },
      ).then((data) => data.updateDocumentDraftContent),
    // A saved edit can make the resume's match and ATS result stale; refetch so
    // the Resumes screen shows the reminder rather than a cached "up to date" result.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESUME_MATCHES_KEY_PREFIX });
      void queryClient.invalidateQueries({ queryKey: RESUME_ATS_SCORES_KEY_PREFIX });
    },
  });
}
