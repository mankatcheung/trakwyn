import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { gqlClient } from '#/graphql/client';
import { LOGIN_MUTATION, REGISTER_MUTATION } from '#/features/auth/graphql/authQueries';
import { DELETE_APPLICATION } from '#/features/applications/graphql/applicationMutations';
import { APPLICATION_QUERY } from '#/features/application-detail/graphql/applicationQuery';
import { ERROR_CODES } from '#/constants';
import en from '#/i18n/en.json';
import * as graphqlError from '#/lib/graphqlError';
import { extractGqlError, extractGqlErrorCode } from '#/features/settings/lib/gqlErrors';
import { createApplication, PASSWORD, registerFreshUser } from './support/fixtures';

/**
 * What the API's error vocabulary looks like to the web client (JEF-667).
 *
 * The unit suites hand the helpers an error they built themselves, so a renamed
 * code, or a changed `extensions` shape in `formatError.ts`, passes all of them.
 * Here the errors are raised by real use cases and arrive through `gqlClient`,
 * then go through the same three helpers the UI uses: `getGqlErrorCode`
 * (`lib/graphqlError.ts`), `extractGqlErrorCode` / `extractGqlError`
 * (`features/settings/lib/gqlErrors.ts`) and `getErrorMessage` (`lib/errors.ts`).
 *
 * Plan and quota errors need an API that enforces plans: `plans/entitlements.test.ts`.
 */

const shim = globalThis.__BROWSER_SHIM__!;

/** The rejection a request produced; fails the test when it succeeded. */
async function rejection(request: Promise<unknown>): Promise<unknown> {
  try {
    await request;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to be rejected, but it succeeded');
}

/** Every helper the UI reads a code through must agree on what the server sent. */
function expectCode(error: unknown, code: string): void {
  expect(graphqlError.getGqlErrorCode(error)).toBe(code);
  expect(extractGqlErrorCode(error)).toBe(code);
}

describe('API error codes as the web client reads them', () => {
  let ownerEmail: string;
  let ownerApplicationId: string;

  beforeAll(async () => {
    ownerEmail = await registerFreshUser('errors-owner');
    ownerApplicationId = await createApplication({ company: 'Owner Co', role: 'Owner role' });
  });

  beforeEach(() => {
    // `getErrorMessage` logs what it is given; the log is not what is under test.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('not found', () => {
    it('reports NOT_FOUND for an application id that does not exist', async () => {
      // The detail query answers null or throws; either way no row comes back.
      const outcome = await gqlClient
        .request(APPLICATION_QUERY, { id: 'no-such-application' })
        .then((data) => ({ data }))
        .catch((error: unknown) => ({ error }));

      if ('error' in outcome) {
        expectCode(outcome.error, ERROR_CODES.NOT_FOUND);
        expect(graphqlError.getGqlErrorCode(outcome.error)).toBe('NOT_FOUND');
        expect(extractGqlError(outcome.error)).toEqual(expect.any(String));
      } else {
        expect(outcome.data.application).toBeNull();
      }
    });

    it('turns NOT_FOUND into the fixed "item not found" copy, not the API message', async () => {
      const error = await rejection(gqlClient.request(DELETE_APPLICATION, { id: 'nope' }));
      const { getErrorMessage } = await import('#/lib/errors');

      expectCode(error, ERROR_CODES.NOT_FOUND);
      const raw = extractGqlError(error);
      expect(getErrorMessage(error)).not.toBe(raw);
      expect(getErrorMessage(error)).toBe(en['errors.itemNotFound']);
    });
  });

  describe('validation and conflict', () => {
    it('reports VALIDATION for a password the API refuses, with prose the UI shows as is', async () => {
      const error = await rejection(
        gqlClient.request(REGISTER_MUTATION, { email: 'weak@example.com', password: 'short' }),
      );
      const { getErrorMessage } = await import('#/lib/errors');

      expectCode(error, ERROR_CODES.VALIDATION);
      const message = extractGqlError(error);
      expect(message).toBeTruthy();
      // VALIDATION is not in CODE_MESSAGES: the API's own sentence is what shows.
      expect(getErrorMessage(error)).toBe(message);
    });

    it('reports CONFLICT for an email that is already registered', async () => {
      shim.reset();
      const error = await rejection(
        gqlClient.request(REGISTER_MUTATION, { email: ownerEmail, password: PASSWORD }),
      );
      const { getErrorMessage } = await import('#/lib/errors');

      expectCode(error, ERROR_CODES.CONFLICT);
      expect(getErrorMessage(error)).toBe(extractGqlError(error));

      // Leave the owner signed in for the tests below.
      await gqlClient.request(LOGIN_MUTATION, { email: ownerEmail, password: PASSWORD });
    });
  });

  describe('authentication', () => {
    it('reports UNAUTHORIZED for a wrong password', async () => {
      shim.reset();
      const error = await rejection(
        gqlClient.request(LOGIN_MUTATION, { email: ownerEmail, password: 'not-the-password-1!' }),
      );

      expectCode(error, ERROR_CODES.UNAUTHORIZED);
      await gqlClient.request(LOGIN_MUTATION, { email: ownerEmail, password: PASSWORD });
    });
  });

  describe("another user's application", () => {
    let intruderEmail: string;

    beforeAll(async () => {
      shim.reset();
      intruderEmail = await registerFreshUser('errors-intruder');
    });

    afterAll(async () => {
      shim.reset();
      await gqlClient.request(LOGIN_MUTATION, { email: ownerEmail, password: PASSWORD });
    });

    it('never returns the row: it is NOT_FOUND or FORBIDDEN, or null', async () => {
      const outcome = await gqlClient
        .request(APPLICATION_QUERY, { id: ownerApplicationId })
        .then((data) => ({ data }))
        .catch((error: unknown) => ({ error }));

      if ('error' in outcome) {
        expect([ERROR_CODES.NOT_FOUND, ERROR_CODES.FORBIDDEN]).toContain(
          graphqlError.getGqlErrorCode(outcome.error),
        );
        expect(JSON.stringify(outcome.error)).not.toContain('Owner Co');
      } else {
        expect(outcome.data.application).toBeNull();
      }
      expect(intruderEmail).not.toBe(ownerEmail);
    });

    it('cannot delete it, and the owner still has it afterwards', async () => {
      const error = await rejection(
        gqlClient.request(DELETE_APPLICATION, { id: ownerApplicationId }),
      );
      expect([ERROR_CODES.NOT_FOUND, ERROR_CODES.FORBIDDEN]).toContain(
        graphqlError.getGqlErrorCode(error),
      );

      shim.reset();
      await gqlClient.request(LOGIN_MUTATION, { email: ownerEmail, password: PASSWORD });
      const { application } = await gqlClient.request(APPLICATION_QUERY, {
        id: ownerApplicationId,
      });
      expect(application?.company).toBe('Owner Co');
    });
  });

  describe('code vocabulary', () => {
    const API_ERROR_CODES_FILE = resolve(
      import.meta.dirname,
      '../../../api/src/use-cases/errors/errorCodes.ts',
    );

    /** `NAME: 'VALUE'` pairs of the API's `ERROR_CODES`, read from its source. */
    const apiCodes = [
      ...readFileSync(API_ERROR_CODES_FILE, 'utf8').matchAll(/^\s{2}([A-Z_]+): '([A-Z_]+)',$/gm),
    ].map(([, name, value]) => {
      expect(value).toBe(name);
      return value;
    });

    /**
     * Every API code is either raised in this file or in plans/entitlements.test.ts
     * (`tested`), or named here with the reason web cannot reach it from this tier.
     * A code added to the API fails the first test below until it is listed.
     */
    const COVERAGE: Record<string, { tested: string } | { notReachable: string }> = {
      UNAUTHORIZED: { tested: 'errorCodes.test.ts: wrong password' },
      USER_NOT_FOUND: { notReachable: 'only raised on flows that name a user the caller owns' },
      FORBIDDEN: { tested: 'errorCodes.test.ts: cross-user access (NOT_FOUND or FORBIDDEN)' },
      NOT_FOUND: { tested: 'errorCodes.test.ts: missing application' },
      CONFLICT: { tested: 'errorCodes.test.ts: duplicate email' },
      QUOTA_EXCEEDED: { tested: 'plans/entitlements.test.ts: the Free application cap' },
      VALIDATION: { tested: 'errorCodes.test.ts: weak password' },
      RATE_LIMITED: { notReachable: 'rate limits are off outside production' },
      INTERNAL_ERROR: { notReachable: 'a fault, not something a request can ask for' },
      SERVICE_UNAVAILABLE: { notReachable: 'a fault, not something a request can ask for' },
      AI_NOT_CONFIGURED: {
        notReachable: 'needs an AI action; covered by aiErrors in the API suite',
      },
      AI_RESPONSE_INVALID: { notReachable: 'needs a malformed model answer' },
      AI_LIMIT_REACHED: { notReachable: 'needs a key past its monthly token limit' },
      AI_PROVIDER_ERROR: { notReachable: "needs the user's own provider to fail" },
      STEP_UP_REQUIRED: { notReachable: 'needs a 2FA account' },
      AI_CREDITS_EXHAUSTED: { notReachable: 'Free has no hosted credits to exhaust (JEF-451)' },
      AI_TEMPORARILY_UNAVAILABLE: { notReachable: 'needs the platform spend budget used up' },
      CAPTCHA_REQUIRED: { notReachable: 'the captcha is off outside production' },
      CAPTCHA_FAILED: { notReachable: 'the captcha is off outside production' },
      PLAN_REQUIRED: { tested: 'plans/entitlements.test.ts: a Pro feature as a Free user' },
      EMAIL_NOT_VERIFIED: { notReachable: 'the verification wall is covered by the API suite' },
      ACCOUNT_DELETION_SCHEDULED: { notReachable: 'needs a scheduled deletion' },
    };

    it('reads the API codes from its source', () => {
      expect(apiCodes.length).toBeGreaterThan(15);
    });

    it('accounts for every code the API defines, and none it no longer does', () => {
      expect(Object.keys(COVERAGE).sort()).toEqual([...apiCodes].sort());
    });

    it('only branches on codes the API still defines', () => {
      const webSwitchedCodes = [
        ...Object.values(ERROR_CODES),
        graphqlError.AI_NOT_CONFIGURED_CODE,
        graphqlError.AI_LIMIT_REACHED_CODE,
        graphqlError.PLAN_REQUIRED_CODE,
        graphqlError.AI_CREDITS_EXHAUSTED_CODE,
        graphqlError.EMAIL_NOT_VERIFIED_CODE,
        graphqlError.AI_TEMPORARILY_UNAVAILABLE_CODE,
      ];

      expect(webSwitchedCodes.filter((code) => !apiCodes.includes(code))).toEqual([]);
    });
  });
});
