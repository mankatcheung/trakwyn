import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

export const DOCUMENTS_QUERY = `
  query Documents($applicationId: ID!) {
    documents(applicationId: $applicationId) { id applicationId name mimeType sizeBytes url documentType version createdAt }
  }
`;

export const DOCUMENT_DRAFTS_QUERY = `
  query DocumentDrafts($applicationId: ID!) {
    documentDrafts(applicationId: $applicationId) {
      id
      applicationId
      type
      title
      createdAt
      updatedAt
    }
  }
`;

export type Document = {
  id: string;
  applicationId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  documentType: string;
  version?: string | null;
  createdAt: string;
};

export type DocumentDraft = {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export const documentsQueryKey = (applicationId: string) => ['documents', applicationId] as const;
export const documentDraftsQueryKey = (applicationId: string) =>
  ['documentDrafts', applicationId] as const;

/**
 * One definition per list, shared by the three document tabs and the section
 * counts: the counts are derived from these same cache entries, so a tab that
 * adds or removes an item moves its badge without a second request.
 */
export const documentsQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: documentsQueryKey(applicationId),
    queryFn: () => gqlClient.request<{ documents: Document[] }>(DOCUMENTS_QUERY, { applicationId }),
  });

export const documentDraftsQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: documentDraftsQueryKey(applicationId),
    queryFn: () =>
      gqlClient.request<{ documentDrafts: DocumentDraft[] }>(DOCUMENT_DRAFTS_QUERY, {
        applicationId,
      }),
  });
