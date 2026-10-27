import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const BILLING_STATUS_QUERY = `
  query BillingStatus {
    billingStatus {
      enforced
      plan
      planExpiresAt
      planSource
      features { notifications analytics offers shareLinks apiAccess mcpAccess }
      limits { applications documentBytes }
      catalogue {
        free {
          features { notifications analytics offers shareLinks apiAccess mcpAccess }
          limits { applications documentBytes }
        }
        pro {
          features { notifications analytics offers shareLinks apiAccess mcpAccess }
          limits { applications documentBytes }
        }
      }
      usage { applications documentBytes }
    }
  }
`;

export const billingStatusQueryKey = ['billingStatus'] as const;

export type Plan = 'free' | 'pro';
export type PlanSource = 'subscription' | 'pass' | 'trial' | 'grant';

export interface PlanFeatures {
  notifications: boolean;
  analytics: boolean;
  offers: boolean;
  shareLinks: boolean;
  apiAccess: boolean;
  mcpAccess: boolean;
}

/** `null` is "no limit". */
export interface PlanLimits {
  applications: number | null;
  documentBytes: number;
}

export interface PlanTerms {
  features: PlanFeatures;
  limits: PlanLimits;
}

export interface BillingStatus {
  /** False when the instance does not enforce plans: every feature is then on. */
  enforced: boolean;
  plan: Plan;
  planExpiresAt: string | null;
  planSource: PlanSource | null;
  features: PlanFeatures;
  limits: PlanLimits;
  catalogue: { free: PlanTerms; pro: PlanTerms };
  usage: { applications: number; documentBytes: number };
}

/** The signed-in user's plan and usage, or null while loading. */
export function useBillingStatus(): BillingStatus | null {
  const { data } = useQuery({
    queryKey: billingStatusQueryKey,
    queryFn: () => gqlClient.request<{ billingStatus: BillingStatus }>(BILLING_STATUS_QUERY),
  });
  return data?.billingStatus ?? null;
}

/** `ok` below 80% of the limit, `warning` from 80%, `full` once nothing more fits. */
export type UsageLevel = 'unlimited' | 'ok' | 'warning' | 'full';

const WARNING_FRACTION = 0.8;

export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return 'unlimited';
  if (used >= limit) return 'full';
  return used >= limit * WARNING_FRACTION ? 'warning' : 'ok';
}

/** Share of the limit used, 0–100. Reads 100 only once the limit is reached, never from rounding. */
export function usagePercent(used: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  if (used >= limit) return 100;
  return Math.min(99, Math.round((used / limit) * 100));
}

export interface PlanStatusMessage {
  /** An i18n key under `plan.status*`. */
  key: string;
  /** ISO date for the keys that name one. */
  date?: string;
}

/** Which sentence says where this user stands, and the date it needs, if any. */
export function planStatus(status: BillingStatus): PlanStatusMessage {
  if (!status.enforced) return { key: 'plan.statusNotEnforced' };
  if (status.plan === 'free') return { key: 'plan.statusFree' };

  const date = status.planExpiresAt ?? undefined;
  switch (status.planSource) {
    case 'subscription':
      return { key: 'plan.statusSubscription' };
    case 'pass':
      return date ? { key: 'plan.statusPass', date } : { key: 'plan.statusPro' };
    case 'trial':
      return date ? { key: 'plan.statusTrial', date } : { key: 'plan.statusPro' };
    case 'grant':
      return date ? { key: 'plan.statusGrantUntil', date } : { key: 'plan.statusGrant' };
    default:
      return { key: 'plan.statusPro' };
  }
}
