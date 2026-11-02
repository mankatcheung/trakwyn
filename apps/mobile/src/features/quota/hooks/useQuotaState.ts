import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { CONTENT_QUOTA_QUERY } from '../graphql/operations';
import { quotaLevel, type QuotaLevel } from '../lib/quotaLevel';

export const contentQuotaQueryKey = ['contentQuota'] as const;

/** Where each capped resource's limit comes from, and its per-user usage (absent for per-application ones, which the screen counts). */
const RESOURCES = {
  notes: { limit: 'notesPerApplication' },
  contacts: { limit: 'contactsPerApplication' },
  interviewRounds: { limit: 'interviewRoundsPerApplication' },
  offers: { limit: 'offersPerApplication' },
  tags: { limit: 'tagsPerApplication' },
  documentDrafts: { limit: 'documentDraftsPerApplication' },
  conversations: { limit: 'conversationsPerUser', usage: 'conversations' },
  workExperiences: { limit: 'workExperiencesPerUser', usage: 'workExperiences' },
  educations: { limit: 'educationsPerUser', usage: 'educations' },
  skills: { limit: 'skillsPerUser', usage: 'skills' },
  shareLinks: { limit: 'shareLinksPerUser', usage: 'shareLinks' },
  apiTokens: { limit: 'apiTokensPerUser', usage: 'apiTokens' },
} as const;

export type QuotaResource = keyof typeof RESOURCES;

interface ContentQuota {
  limits: Record<string, number>;
  usage: Record<string, number>;
}

export interface QuotaState {
  used: number;
  limit: number;
  level: QuotaLevel;
}

/**
 * Where one resource stands (JEF-494). Per-application resources pass `used`
 * (the screen already holds the list); per-user ones leave it out and read the
 * API's count. Null until the limit is known, so nothing is blocked on a guess.
 */
export function useQuotaState(resource: QuotaResource, used?: number): QuotaState | null {
  const { data } = useQuery({
    queryKey: contentQuotaQueryKey,
    queryFn: () => gqlRequest<{ contentQuota: ContentQuota | null }>(CONTENT_QUOTA_QUERY),
    staleTime: 15_000,
  });
  const quota = data?.contentQuota;
  if (!quota) return null;
  const config: { limit: string; usage?: string } = RESOURCES[resource];
  const limit = quota.limits[config.limit];
  const count = used ?? (config.usage ? quota.usage[config.usage] : undefined);
  if (typeof limit !== 'number' || typeof count !== 'number') return null;
  return { used: count, limit, level: quotaLevel(count, limit) };
}

/** True once nothing more of this resource can be added. False while unknown. */
export function useQuotaFull(resource: QuotaResource, used?: number): boolean {
  return useQuotaState(resource, used)?.level === 'full';
}
