import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

export const TRASHED_APPLICATIONS_QUERY = `
  query TrashedApplications {
    trashedApplications {
      id
      company
      role
      status
      location
      appliedAt
      deletedAt
      purgeAt
    }
  }
`;

export const RESTORE_APPLICATION = `
  mutation RestoreApplication($id: ID!) {
    restoreApplication(id: $id)
  }
`;

export const PERMANENTLY_DELETE_APPLICATION = `
  mutation PermanentlyDeleteApplication($id: ID!) {
    permanentlyDeleteApplication(id: $id)
  }
`;

export const BULK_RESTORE_APPLICATIONS = `
  mutation BulkRestoreApplications($ids: [ID!]!) {
    bulkRestoreApplications(ids: $ids) { restored }
  }
`;

export const EMPTY_TRASH = `
  mutation EmptyTrash {
    emptyTrash { deleted failed }
  }
`;

export type TrashedApplication = {
  id: string;
  company: string;
  role: string;
  status: string;
  location?: string | null;
  appliedAt?: string | null;
  deletedAt: string | null;
  /** deletedAt + the server's retention window; the countdown target. */
  purgeAt: string | null;
};

export type TrashedApplicationsResult = { trashedApplications: TrashedApplication[] };

export const trashedApplicationsQueryOptions = () =>
  queryOptions({
    queryKey: ['applications', 'trash'] as const,
    queryFn: () => gqlClient.request<TrashedApplicationsResult>(TRASHED_APPLICATIONS_QUERY),
  });

/**
 * Whole days left before the purge job removes this application, rounded up so
 * the last partial day still reads as "1 day" rather than "0". Returns 0 once
 * the instant has passed — the row is then waiting on the next cron run, not
 * overdue in any sense the user can act on.
 */
export function daysUntilPurge(purgeAt: string | null, now: Date = new Date()): number | null {
  if (!purgeAt) return null;
  const remaining = new Date(purgeAt).getTime() - now.getTime();
  if (Number.isNaN(remaining)) return null;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export type BulkRestoreResult = { bulkRestoreApplications: { restored: number } };
export type EmptyTrashResult = { emptyTrash: { deleted: number; failed: number } };
