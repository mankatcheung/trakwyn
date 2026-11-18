import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

const DOCUMENT_VERSION_OUTCOMES_QUERY = graphql(`
  query DocumentVersionOutcomes {
    documentVersionOutcomes {
      documentType
      version
      applicationCount
      interviewCount
      interviewRate
    }
  }
`);

export interface DocumentVersionOutcome {
  documentType: string;
  version: string | null;
  applicationCount: number;
  interviewCount: number;
  interviewRate: number;
}

export const documentVersionOutcomesQueryOptions = queryOptions({
  queryKey: ['documentVersionOutcomes'],
  queryFn: async () =>
    (await gqlClient.request(DOCUMENT_VERSION_OUTCOMES_QUERY)) as {
      documentVersionOutcomes: DocumentVersionOutcome[];
    },
});
