import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV } from '#src/infrastructure/config/constants.js';

const GOOD_TOKEN = 'good-token';
const PASSWORD = 'correct-horse-1';

const REGISTER = `
  mutation Register($email: String!, $password: String!, $captchaToken: String) {
    register(email: $email, password: $password, captchaToken: $captchaToken)
  }
`;
const REGISTER_MOBILE = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) { accessToken }
  }
`;
const LOGIN = `
  mutation Login($email: String!, $password: String!, $captchaToken: String) {
    login(email: $email, password: $password, captchaToken: $captchaToken) { success }
  }
`;
const LOGIN_MOBILE = `
  mutation LoginMobile($email: String!, $password: String!) {
    loginMobile(email: $email, password: $password) { success }
  }
`;
const REQUEST_RESET = `
  mutation Reset($email: String!, $captchaToken: String) {
    requestPasswordReset(email: $email, captchaToken: $captchaToken)
  }
`;
const REQUEST_RESET_MOBILE = `
  mutation ResetMobile($email: String!) {
    requestPasswordResetMobile(email: $email)
  }
`;

interface GraphQLResponse {
  data: Record<string, unknown> | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/**
 * The captcha as production runs it: the real Turnstile verifier, with only
 * Cloudflare's `siteverify` answer stubbed (JEF-401). The app's default
 * verifier is permissive outside production, which could never refuse.
 */
describe('captcha integration', () => {
  let testApp: TestApp;
  const savedEnv = {
    provider: process.env[ENV.CAPTCHA_PROVIDER],
    secret: process.env[ENV.TURNSTILE_SECRET_KEY],
  };

  const gql = async (
    query: string,
    variables: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers,
      payload: { query, variables },
    });
    return res.json() as GraphQLResponse;
  };
  const codeOf = (res: GraphQLResponse) => res.errors?.[0]?.extensions?.code;
  const newEmail = () => `${randomUUID()}@example.com`;

  beforeAll(async () => {
    process.env[ENV.CAPTCHA_PROVIDER] = 'turnstile';
    process.env[ENV.TURNSTILE_SECRET_KEY] = 'test-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: URLSearchParams }) =>
        Response.json({ success: init.body.get('response') === GOOD_TOKEN }),
      ),
    );
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
    vi.unstubAllGlobals();
    if (savedEnv.provider === undefined) delete process.env[ENV.CAPTCHA_PROVIDER];
    else process.env[ENV.CAPTCHA_PROVIDER] = savedEnv.provider;
    if (savedEnv.secret === undefined) delete process.env[ENV.TURNSTILE_SECRET_KEY];
    else process.env[ENV.TURNSTILE_SECRET_KEY] = savedEnv.secret;
  });

  describe('register', () => {
    it('asks for a captcha when none is sent', async () => {
      const res = await gql(REGISTER, { email: newEmail(), password: PASSWORD });

      expect(codeOf(res)).toBe('CAPTCHA_REQUIRED');
    });

    it('refuses a token Cloudflare rejects', async () => {
      const res = await gql(REGISTER, {
        email: newEmail(),
        password: PASSWORD,
        captchaToken: 'forged',
      });

      expect(codeOf(res)).toBe('CAPTCHA_FAILED');
    });

    it('signs up with a valid token', async () => {
      const res = await gql(REGISTER, {
        email: newEmail(),
        password: PASSWORD,
        captchaToken: GOOD_TOKEN,
      });

      expect(res.errors).toBeUndefined();
      expect(typeof res.data?.register).toBe('string');
    });

    it('lets the mobile mutation through without one', async () => {
      const res = await gql(REGISTER_MOBILE, { email: newEmail(), password: PASSWORD });

      expect(res.errors).toBeUndefined();
    });
  });

  describe('login', () => {
    it('asks for a captcha only after repeated failures, then accepts one', async () => {
      const email = newEmail();
      await gql(REGISTER_MOBILE, { email, password: PASSWORD });

      for (let attempt = 0; attempt < 3; attempt++) {
        const failed = await gql(LOGIN, { email, password: 'wrong-password' });
        expect(codeOf(failed)).toBe('UNAUTHORIZED');
      }

      const blocked = await gql(LOGIN, { email, password: PASSWORD });
      expect(codeOf(blocked)).toBe('CAPTCHA_REQUIRED');

      const stillBlocked = await gql(LOGIN, { email, password: PASSWORD, captchaToken: 'forged' });
      expect(codeOf(stillBlocked)).toBe('CAPTCHA_FAILED');

      const allowed = await gql(LOGIN, { email, password: PASSWORD, captchaToken: GOOD_TOKEN });
      expect(allowed.errors).toBeUndefined();
      expect(allowed.data?.login).toEqual({ success: true });
    });

    it('never asks the mobile mutation, however many failures', async () => {
      const email = newEmail();
      await gql(REGISTER_MOBILE, { email, password: PASSWORD });

      for (let attempt = 0; attempt < 4; attempt++) {
        await gql(LOGIN_MOBILE, { email, password: 'wrong-password' });
      }
      const res = await gql(LOGIN_MOBILE, { email, password: PASSWORD });

      expect(res.errors).toBeUndefined();
      expect(res.data?.loginMobile).toEqual({ success: true });
    });
  });

  describe('requestPasswordReset', () => {
    it('asks for a captcha when none is sent', async () => {
      const res = await gql(REQUEST_RESET, { email: newEmail() });

      expect(codeOf(res)).toBe('CAPTCHA_REQUIRED');
    });

    it('accepts a valid token', async () => {
      const res = await gql(REQUEST_RESET, { email: newEmail(), captchaToken: GOOD_TOKEN });

      expect(res.errors).toBeUndefined();
      expect(res.data?.requestPasswordReset).toBe(true);
    });

    // App builds already in the stores call the shared mutation with no token.
    it('lets a request from the mobile app through without a token', async () => {
      const res = await gql(
        REQUEST_RESET,
        { email: newEmail() },
        { 'user-agent': 'TrakwynMobile/1.4.0 (iPhone15,2; iOS 17.4)' },
      );

      expect(res.errors).toBeUndefined();
      expect(res.data?.requestPasswordReset).toBe(true);
    });

    it('still asks a browser that merely sends another User-Agent', async () => {
      const res = await gql(
        REQUEST_RESET,
        { email: newEmail() },
        { 'user-agent': 'Mozilla/5.0 (Macintosh) TrakwynMobileLookalike' },
      );

      expect(codeOf(res)).toBe('CAPTCHA_REQUIRED');
    });

    it('accepts the mobile mutation without one', async () => {
      const res = await gql(REQUEST_RESET_MOBILE, { email: newEmail() });

      expect(res.errors).toBeUndefined();
      expect(res.data?.requestPasswordResetMobile).toBe(true);
    });
  });
});
