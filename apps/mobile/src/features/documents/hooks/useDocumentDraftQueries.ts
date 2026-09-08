import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { DOCUMENT_DRAFTS_QUERY, DOCUMENT_DRAFT_QUERY } from '../graphql/draftOperations';
import type { DocumentDraft, DocumentDraftSummary } from '../types';

export const documentDraftsQueryKey = (applicationId: string) =>
  ['documentDrafts', applicationId] as const;

export const documentDraftQueryKey = (draftId: string) => ['documentDraft', draftId] as const;

export function useDocumentDrafts(applicationId: string) {
  return useQuery({
    queryKey: documentDraftsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ documentDrafts: DocumentDraftSummary[] }>(DOCUMENT_DRAFTS_QUERY, {
        applicationId,
      }).then((data) => data.documentDrafts),
    enabled: Boolean(applicationId),
  });
}

export function useDocumentDraft(draftId: string) {
  return useQuery({
    queryKey: documentDraftQueryKey(draftId),
    queryFn: () =>
      gqlRequest<{ documentDraft: DocumentDraft }>(DOCUMENT_DRAFT_QUERY, { id: draftId }).then(
        (data) => data.documentDraft,
      ),
    enabled: Boolean(draftId),
  });
}
