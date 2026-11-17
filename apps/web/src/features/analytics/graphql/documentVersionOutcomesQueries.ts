import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const DOCUMENT_VERSION_OUTCOMES_QUERY = `
  query DocumentVersionOutcomes {
    documentVersionOutcomes {
      documentType
      version
      applicationCount
      interviewCount
      interviewRate
    }
  }
`;

export interface DocumentVersionOutcome {
  documentType: string;
  version: string | null;
  applicationCount: number;
  interviewCount: number;
  interviewRate: number;
}

export const documentVersionOutcomesQueryOptions = queryOptions({
  queryKey: ['documentVersionOutcomes'],
  queryFn: () =>
    gqlClient.request<{ documentVersionOutcomes: DocumentVersionOutcome[] }>(
      DOCUMENT_VERSION_OUTCOMES_QUERY,
    ),
});
