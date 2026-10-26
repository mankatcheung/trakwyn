import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Cradle } from '#src/http/di/types.js';
import { ROUTES } from '#src/http/constants.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

/**
 * JEF-438: a password sign-up that has not verified its email can sign in but
 * nothing else. The wall is enforced on the API, so every client meets it, not
 * just the web app's full-page reminder.
 */

const REGISTER = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;
const ME = `query Me { me { id email emailVerified } }`;
const APPLICATIONS = `query Applications { applications { id } }`;
const CREATE_APPLICATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
  }
`;
const RESEND = `mutation Resend { resendVerificationEmail }`;
const VERIFY = `mutation Verify($token: String!) { verifyEmail(token: $token) }`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string; statusCode?: number } }>;
}

function gql<T>(testApp: TestApp, query: string, variables?: object, token?: string) {
  return testApp.app
    .inject({
      method: 'POST',
      url: '/graphql',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { query, variables },
    })
    .then((res) => res.json() as GraphQLResponse<T>);
}

async function register(testApp: TestApp): Promise<string> {
  const email = `${randomUUID()}@example.com`;
  const body = await gql<{ register: string }>(testApp, REGISTER, {
    email,
    password: 'correct-horse-1',
  });
  return body.data!.register;
}

describe('email verification wall, auto-verify off (production behaviour)', () => {
  let testApp: TestApp;
  let sentLinks: string[];

  beforeAll(async () => {
    process.env[ENV.AUTO_VERIFY_EMAIL] = 'false';
    testApp = await buildTestApp();
    sentLinks = [];
    // Capture the link the user would be emailed. No provider is configured in
    // tests, and registration swallows that, so this is also what stands in
    // for the inbox.
    const { emailService } = testApp.app.diContainer.cradle as unknown as Cradle;
    vi.spyOn(emailService, 'sendEmailVerification').mockImplementation(async (_to, url) => {
      sentLinks.push(url);
    });
  });

  afterAll(async () => {
    delete process.env[ENV.AUTO_VERIFY_EMAIL];
    await testApp.cleanup();
  });

  it('lets an unverified user read who they are, marked unverified', async () => {
    const token = await register(testApp);

    const body = await gql<{ me: { emailVerified: boolean } }>(testApp, ME, undefined, token);

    expect(body.errors).toBeUndefined();
    expect(body.data!.me.emailVerified).toBe(false);
  });

  it('refuses a query for their data with EMAIL_NOT_VERIFIED', async () => {
    const token = await register(testApp);

    const body = await gql(testApp, APPLICATIONS, undefined, token);

    expect(body.errors![0]!.extensions).toMatchObject({
      code: ERROR_CODES.EMAIL_NOT_VERIFIED,
      statusCode: 403,
    });
  });

  it('refuses a mutation, and writes nothing', async () => {
    const token = await register(testApp);

    const refused = await gql(
      testApp,
      CREATE_APPLICATION,
      { input: { company: 'Acme', role: 'Engineer' } },
      token,
    );
    const afterwards = await gql<{ applications: unknown[] }>(
      testApp,
      APPLICATIONS,
      undefined,
      token,
    );

    expect(refused.errors![0]!.extensions!.code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
    expect(afterwards.errors![0]!.extensions!.code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
  });

  it('refuses the disallowed field of a mixed query and still answers the allowed one', async () => {
    const token = await register(testApp);

    const body = await gql<{ me?: { id: string } }>(
      testApp,
      `query { me { id } applications { id } }`,
      undefined,
      token,
    );

    expect(body.errors).toHaveLength(1);
    expect(body.errors![0]!.extensions!.code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
    expect(body.data?.me?.id).toBeTruthy();
  });

  it('refuses the chat stream with a 403 before it opens', async () => {
    const token = await register(testApp);

    const res = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      headers: { authorization: `Bearer ${token}` },
      payload: { conversationId: 'c', message: 'hi' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: ERROR_CODES.EMAIL_NOT_VERIFIED });
  });

  it('sends a fresh link on resend', async () => {
    const token = await register(testApp);
    sentLinks.length = 0;

    const body = await gql<{ resendVerificationEmail: boolean }>(testApp, RESEND, undefined, token);

    expect(body.errors).toBeUndefined();
    expect(body.data!.resendVerificationEmail).toBe(true);
    expect(sentLinks).toHaveLength(1);
  });

  it('refuses resend without a session', async () => {
    const body = await gql(testApp, RESEND);

    expect(body.errors![0]!.extensions!.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('opens the wall once the emailed link is used, with no new sign-in', async () => {
    const token = await register(testApp);
    sentLinks.length = 0;
    await gql(testApp, RESEND, undefined, token);
    const link = new URL(sentLinks[0]!);

    const verified = await gql(testApp, VERIFY, { token: link.searchParams.get('token') });
    expect(verified.errors).toBeUndefined();

    const me = await gql<{ me: { emailVerified: boolean } }>(testApp, ME, undefined, token);
    expect(me.data!.me.emailVerified).toBe(true);
    const applications = await gql(testApp, APPLICATIONS, undefined, token);
    expect(applications.errors).toBeUndefined();
  });
});

describe('email verification wall, auto-verify on (dev and CI default)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    delete process.env[ENV.AUTO_VERIFY_EMAIL];
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('signs a new user up already verified, so the wall never shows', async () => {
    const token = await register(testApp);

    const me = await gql<{ me: { emailVerified: boolean } }>(testApp, ME, undefined, token);
    const applications = await gql(testApp, APPLICATIONS, undefined, token);

    expect(me.data!.me.emailVerified).toBe(true);
    expect(applications.errors).toBeUndefined();
  });
});

describe('email verification wall, kill switch off (EMAIL_VERIFICATION_REQUIRED=false)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env[ENV.AUTO_VERIFY_EMAIL] = 'false';
    process.env[ENV.EMAIL_VERIFICATION_REQUIRED] = 'false';
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    delete process.env[ENV.AUTO_VERIFY_EMAIL];
    delete process.env[ENV.EMAIL_VERIFICATION_REQUIRED];
    await testApp.cleanup();
  });

  it('lets an unverified user use the app, and every client sees them as verified', async () => {
    const token = await register(testApp);

    const me = await gql<{ me: { emailVerified: boolean } }>(testApp, ME, undefined, token);
    const applications = await gql(testApp, APPLICATIONS, undefined, token);
    const chat = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CHAT_STREAM,
      headers: { authorization: `Bearer ${token}` },
      payload: { conversationId: 'c', message: 'hi' },
    });

    expect(me.data!.me.emailVerified).toBe(true);
    expect(applications.errors).toBeUndefined();
    expect(chat.statusCode).not.toBe(403);
  });
});
