import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { COMPANY_BRIEFING_QUERY } from '../graphql/companyBriefingOperations';
import type { CompanyBriefing } from '../types';

export const companyBriefingQueryKey = (applicationId: string) =>
  ['companyBriefing', applicationId] as const;

export function useCompanyBriefing(applicationId: string) {
  return useQuery({
    queryKey: companyBriefingQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ companyBriefing: CompanyBriefing | null }>(COMPANY_BRIEFING_QUERY, {
        applicationId,
      }).then((data) => data.companyBriefing),
    enabled: Boolean(applicationId),
  });
}
