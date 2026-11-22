import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { REGISTER_MUTATION } from '#/features/auth/graphql/authQueries';
import { CREATE_APPLICATION } from '#/features/applications/graphql/applicationMutations';
import { CREATE_ROUND } from '#/features/interviews/graphql/interviewRoundQueries';
import { SECTION_COUNTS_QUERY } from '#/features/application-detail/graphql/applicationDetailQueries';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

/** Same password every suite uses; the account is what is unique. */
export const PASSWORD = 'CorrectHorseBatteryStaple1!';

/**
 * A query client for one test. `gcTime: Infinity` keeps a finished query's gc
 * timer from outliving the test, `retry: false` makes a failed request fail the
 * test instead of hiding behind a second attempt, and `staleTime: 0` means a
 * `query` always asks the server, so "refetch" is a real round trip.
 *
 * Not the app's `queryClient` (`lib/queryClient.ts`): that one toasts on every
 * mutation error and is shared module state, which would couple the suites.
 */
export function newTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
  });
}

/**
 * Registers an account nobody else has used and leaves the browser shim signed
 * in as it. Call once per file in `beforeAll`: registration is the slowest call
 * and a per-file account still isolates the suites from each other.
 */
export async function registerFreshUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await gqlClient.request(REGISTER_MUTATION, { email, password: PASSWORD });
  return email;
}

export async function createApplication(
  input: { company?: string; role?: string; status?: ApplicationStatus } = {},
): Promise<string> {
  const created = field(
    await gqlClient.request(CREATE_APPLICATION, {
      input: {
        company: input.company ?? 'Acme',
        role: input.role ?? 'Engineer',
        status: input.status ?? 'interviewing',
      },
    }),
    'createApplication',
  );
  return created.id;
}

export async function createRound(applicationId: string): Promise<string> {
  const created = field(
    await gqlClient.request(CREATE_ROUND, {
      input: { applicationId, type: 'technical' },
    }),
    'createInterviewRound',
  );
  return created.id;
}

/** The section badges as the server counts them, read straight from the API. */
export async function sectionCounts(applicationId: string) {
  const application = field(
    await gqlClient.request(SECTION_COUNTS_QUERY, { id: applicationId }),
    'application',
  );
  return application?.sectionCounts;
}

/** Whether `key` is in `client`'s cache and marked stale by an invalidation. */
export function isInvalidated(client: QueryClient, key: QueryKey): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

/** A row whose `id` the schema types as nullable but a successful write always sets. */
type WithId<T> = T extends { id?: infer I } ? Omit<T, 'id'> & { id: NonNullable<I> } : T;

/**
 * One field of a GraphQL answer, which the schema types as nullable. A null
 * here is a failed write (the errors are thrown before this), so say so
 * rather than let a later line fail on `undefined`. A row's `id` is checked
 * the same way.
 */
export function field<T extends object, K extends keyof T>(
  data: T,
  key: K,
): WithId<NonNullable<T[K]>> {
  const value = data[key];
  if (value === null || value === undefined) {
    throw new Error(`The API answered null for ${String(key)}`);
  }
  if (typeof value === 'object' && 'id' in value && !value.id) {
    throw new Error(`The API answered ${String(key)} without an id`);
  }
  return value as WithId<NonNullable<T[K]>>;
}

/** `value` without the named keys: the fields two copies of one row may differ on. */
export function without<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}
