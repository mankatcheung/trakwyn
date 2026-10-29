import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Cradle } from '#src/http/di/types.js';
import { ROUTES } from '#src/http/constants.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ACCOUNT_DELETION, DURATIONS_MS } from '#src/use-cases/constants.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

/**
 * JEF-463, end to end over GraphQL: request (mails a link), confirm (the link,
 * no session), the wall a scheduled account meets after signing in again,
 * cancel (signed in, or by the mailed link), the deprecated `deleteAccount`
 * that shipped apps still call, and the purge.
 */

const PASSWORD = 'correct-horse-1';
const CRON_SECRET = 'test-cron-secret';

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

describe('account deletion', () => {
  let testApp: TestApp;
  let cradle: Cradle;
  const confirmLinks: string[] = [];
  const cancelLinks: string[] = [];

  beforeAll(async () => {
    process.env[ENV.CRON_SECRET] = CRON_SECRET;
    testApp = await buildTestApp();
    cradle = testApp.app.diContainer.cradle as unknown as Cradle;
    vi.spyOn(cradle.emailService, 'sendAccountDeletionConfirmation').mockImplementation(
      async (_to, url) => {
        confirmLinks.push(url);
      },
    );
    vi.spyOn(cradle.emailService, 'sendAccountDeletionScheduled').mockImplementation(
      async (_to, _date, url) => {
        cancelLinks.push(url);
      },
    );
    vi.spyOn(cradle.emailService, 'sendAccountDeletionCancelled').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    delete process.env[ENV.CRON_SECRET];
    await testApp.cleanup();
  });

  function gql<T>(query: string, variables?: object, token?: string) {
    return testApp.app
      .inject({
        method: 'POST',
        url: '/graphql',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        payload: { query, variables },
      })
      .then((res) => res.json() as GraphQLResponse<T>);
  }

  async function register(): Promise<{ email: string; token: string }> {
    const email = `${randomUUID()}@example.com`;
    const body = await gql<{ register: string }>(
      `mutation($e: String!, $p: String!) { register(email: $e, password: $p) }`,
      { e: email, p: PASSWORD },
    );
    return { email, token: body.data!.register };
  }

  async function login(email: string): Promise<string> {
    const body = await gql<{ login: { accessToken: string } }>(
      `mutation($e: String!, $p: String!) { login(email: $e, password: $p) { accessToken } }`,
      { e: email, p: PASSWORD },
    );
    return body.data!.login.accessToken;
  }

  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;
  const APPLICATIONS = `query { applications { id } }`;

  async function scheduleDeletion(
    token: string,
  ): Promise<GraphQLResponse<{ confirmAccountDeletion: string }>> {
    const requested = await gql(`mutation { requestAccountDeletion }`, undefined, token);
    expect(requested.errors).toBeUndefined();
    return gql<{ confirmAccountDeletion: string }>(
      `mutation($t: String!) { confirmAccountDeletion(token: $t) }`,
      { t: tokenOf(confirmLinks[confirmLinks.length - 1]!) },
    );
  }

  it('schedules on confirmation, signs out everywhere, then walls the account until cancelled', async () => {
    const { email, token } = await register();

    const confirmed = await scheduleDeletion(token);

    const date = new Date(confirmed.data!.confirmAccountDeletion);
    expect(date.getTime() - Date.now()).toBeGreaterThan(
      (ACCOUNT_DELETION.GRACE_PERIOD_DAYS - 1) * DURATIONS_MS.DAY,
    );
    // Every session was revoked: the token that asked is no longer accepted.
    const stale = await gql(APPLICATIONS, undefined, token);
    expect(stale.errors?.[0]?.extensions?.code).toBe(ERROR_CODES.UNAUTHORIZED);

    // Signing in still works, but only to see the date and cancel.
    const again = await login(email);
    const me = await gql<{ me: { deletionScheduledAt: string } }>(
      `query { me { deletionScheduledAt } }`,
      undefined,
      again,
    );
    expect(me.data!.me.deletionScheduledAt).toBe(date.toISOString());
    const walled = await gql(APPLICATIONS, undefined, again);
    expect(walled.errors?.[0]?.extensions?.code).toBe(ERROR_CODES.ACCOUNT_DELETION_SCHEDULED);

    const cancelled = await gql(`mutation { cancelAccountDeletion }`, undefined, again);
    expect(cancelled.errors).toBeUndefined();
    const open = await gql(APPLICATIONS, undefined, again);
    expect(open.errors).toBeUndefined();
  });

  it('cancels from the mailed link with no session at all', async () => {
    const { email, token } = await register();
    await scheduleDeletion(token);

    const cancelled = await gql(`mutation($t: String!) { cancelAccountDeletion(token: $t) }`, {
      t: tokenOf(cancelLinks[cancelLinks.length - 1]!),
    });

    expect(cancelled.errors).toBeUndefined();
    const open = await gql(APPLICATIONS, undefined, await login(email));
    expect(open.errors).toBeUndefined();
  });

  it('refuses the confirmation link a second time', async () => {
    const { token } = await register();
    await scheduleDeletion(token);

    const reused = await gql(`mutation($t: String!) { confirmAccountDeletion(token: $t) }`, {
      t: tokenOf(confirmLinks[confirmLinks.length - 1]!),
    });

    expect(reused.errors?.[0]?.extensions?.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('keeps the deprecated deleteAccount working, but it only mails the link', async () => {
    const { email, token } = await register();
    const before = confirmLinks.length;

    const result = await gql<{ deleteAccount: boolean }>(
      `mutation($p: String!) { deleteAccount(password: $p) }`,
      { p: PASSWORD },
      token,
    );

    expect(result.data!.deleteAccount).toBe(true);
    expect(confirmLinks.length).toBe(before + 1);
    expect(await cradle.userRepository.findByEmail(email)).not.toBeNull();
  });

  it('purges an account once its date has passed, and leaves one that is not due', async () => {
    const due = await register();
    await scheduleDeletion(due.token);
    const dueUser = (await cradle.userRepository.findByEmail(due.email))!;
    await cradle.userRepository.update(dueUser.id, {
      deletionScheduledAt: new Date(Date.now() - 1000),
    });
    const notDue = await register();
    await scheduleDeletion(notDue.token);

    const res = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.ACCOUNT_PURGE,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, purged: 1, failed: 0 });
    expect(await cradle.userRepository.findByEmail(due.email)).toBeNull();
    expect(await cradle.userRepository.findByEmail(notDue.email)).not.toBeNull();
  });
});
