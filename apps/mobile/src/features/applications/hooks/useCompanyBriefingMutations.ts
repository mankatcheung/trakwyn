import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { GENERATE_COMPANY_BRIEFING_MUTATION } from '../graphql/companyBriefingOperations';
import { companyBriefingQueryKey } from './useCompanyBriefingQueries';
import type { CompanyBriefing } from '../types';

export function useGenerateCompanyBriefing(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ generateCompanyBriefing: CompanyBriefing }>(GENERATE_COMPANY_BRIEFING_MUTATION, {
        applicationId,
      }).then((data) => data.generateCompanyBriefing),
    onSuccess: (briefing) =>
      queryClient.setQueryData(companyBriefingQueryKey(applicationId), briefing),
  });
}
