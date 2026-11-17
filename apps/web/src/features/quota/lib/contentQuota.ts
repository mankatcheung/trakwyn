import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const CONTENT_QUOTA_QUERY = `
  query ContentQuota {
    contentQuota {
      limits {
        notesPerApplication contactsPerApplication interviewRoundsPerApplication
        offersPerApplication tagsPerApplication documentDraftsPerApplication
        conversationsPerUser workExperiencesPerUser educationsPerUser skillsPerUser
        shareLinksPerUser apiTokensPerUser pushSubscriptionsPerUser
      }
      usage {
        conversations workExperiences educations skills shareLinks apiTokens pushSubscriptions
      }
    }
  }
`;

export const contentQuotaQueryKey = ['contentQuota'] as const;

/** Where each capped resource's limit comes from, and its per-user usage (absent for per-application ones, which the caller counts). */
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
  pushSubscriptions: { limit: 'pushSubscriptionsPerUser', usage: 'pushSubscriptions' },
} as const;

export type QuotaResource = keyof typeof RESOURCES;

type LimitKey = (typeof RESOURCES)[QuotaResource]['limit'];

export interface ContentQuota {
  limits: Record<LimitKey, number>;
  usage: Record<string, number>;
}

/** `ok` below 80% of the limit (nothing is shown), `warning` from 80%, `full` once nothing more can be added. */
export type QuotaLevel = 'ok' | 'warning' | 'full';

const WARNING_FRACTION = 0.8;

export function quotaLevel(used: number, limit: number): QuotaLevel {
  if (used >= limit) return 'full';
  return used >= limit * WARNING_FRACTION ? 'warning' : 'ok';
}

export interface QuotaState {
  used: number;
  limit: number;
  level: QuotaLevel;
}

/** The signed-in user's limits and per-user usage, or null while loading or when the API sends none. */
export function useContentQuota(): ContentQuota | null {
  const { data } = useQuery({
    queryKey: contentQuotaQueryKey,
    queryFn: () => gqlClient.request<{ contentQuota: ContentQuota | null }>(CONTENT_QUOTA_QUERY),
    staleTime: 60_000,
  });
  return data?.contentQuota ?? null;
}

/**
 * Where one resource stands. Per-application resources pass `used` (the tab
 * already holds the list); per-user ones leave it out and read the API's
 * count. Null until the limit is known, so nothing is blocked on a guess.
 */
export function useQuotaState(resource: QuotaResource, used?: number): QuotaState | null {
  const quota = useContentQuota();
  if (!quota) return null;
  const config: { limit: LimitKey; usage?: string } = RESOURCES[resource];
  const limit = quota.limits[config.limit];
  const count = used ?? (config.usage ? quota.usage[config.usage] : undefined);
  if (typeof limit !== 'number' || typeof count !== 'number') return null;
  return { used: count, limit, level: quotaLevel(count, limit) };
}
