import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { GENERATE_COMPANY_BRIEFING_MUTATION } from '../graphql/companyBriefingOperations';
import { useRefreshAiCredits } from '../../ai/hooks/useRefreshAiCredits';
import { companyBriefingQueryKey } from './useCompanyBriefingQueries';
import type { CompanyBriefing } from '../types';

export function useGenerateCompanyBriefing(applicationId: string) {
  const queryClient = useQueryClient();
  const refreshCredits = useRefreshAiCredits();
  return useMutation({
    onSettled: () => void refreshCredits(),
    mutationFn: (instructions?: string) =>
      gqlRequest<{ generateCompanyBriefing: CompanyBriefing }>(GENERATE_COMPANY_BRIEFING_MUTATION, {
        applicationId,
        instructions: instructions?.trim() || null,
      }).then((data) => data.generateCompanyBriefing),
    onSuccess: (briefing) =>
      queryClient.setQueryData(companyBriefingQueryKey(applicationId), briefing),
  });
}
