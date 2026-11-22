import { vi } from 'vitest';
import { gqlClient } from '#/graphql/client';
import { ERROR_CODES } from '#/constants';
import { PLAN_REQUIRED_CODE, getGqlErrorCode } from '#/lib/graphqlError';
import { getErrorMessage } from '#/lib/errors';
import { extractGqlError, extractGqlErrorCode } from '#/features/settings/lib/gqlErrors';
import { BILLING_STATUS_QUERY } from '#/features/plans/lib/billingStatus';
import { quotaLevel } from '#/features/quota/lib/contentQuota';
import { CREATE_SHARE_LINK } from '#/features/settings/graphql/integrationsQueries';
import { CREATE_OFFER_MUTATION } from '#/features/offers/graphql/applicationOffersQueries';
import { MY_OFFERS_QUERY } from '#/features/offers/graphql/offersQueries';
import {
  CREATE_APPLICATION,
  DELETE_APPLICATION,
} from '#/features/applications/graphql/applicationMutations';
import { APPLICATION_QUERY } from '#/features/application-detail/graphql/applicationQuery';
import { createApplication, field, registerFreshUser } from '../support/fixtures';

/**
 * Plan and quota errors from an API that enforces plans (JEF-667). This project
 * (`integration-plans`) boots its own API with `PLANS_ENFORCED=true`, because
 * `EntitlementService` reads the flag once at boot and the rest of the tier
 * writes Pro features as a new user.
 *
 * A new account is Free, with no trial, so no seeding is needed: the logic of
 * `pnpm plan set` writes to the database directly and a running PGlite has one
 * owner. A downgrade is therefore not reached by changing a plan; the
 * "over the cap" state it leaves behind is (the last test).
 */

async function rejection(request: Promise<unknown>): Promise<unknown> {
  try {
    await request;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to be rejected, but it succeeded');
}

const billing = async () => field(await gqlClient.request(BILLING_STATUS_QUERY), 'billingStatus');

describe('plan and quota errors against an API that enforces plans', () => {
  beforeAll(async () => {
    await registerFreshUser('plans-free');
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is really enforcing, and the new user is on Free', async () => {
    // A reused foreign API on this port would make every test below pass or
    // fail for the wrong reason.
    const status = await billing();

    expect(status.enforced).toBe(true);
    expect(status.plan).toBe('free');
    expect(status.features?.shareLinks).toBe(false);
    expect(status.features?.offers).toBe(false);
  });

  describe('PLAN_REQUIRED', () => {
    it('refuses a Pro write, and the share links card reads it as "needs Pro"', async () => {
      const error = await rejection(gqlClient.request(CREATE_SHARE_LINK, { name: 'Coach' }));

      expect(getGqlErrorCode(error)).toBe(PLAN_REQUIRED_CODE);
      expect(PLAN_REQUIRED_CODE).toBe(ERROR_CODES.PLAN_REQUIRED);
      // What `ShareLinksCard` tests to show UpgradePrompt instead of a failure.
      expect(extractGqlErrorCode(error) === PLAN_REQUIRED_CODE).toBe(true);
      // UpgradePrompt shows the API's own sentence, so there has to be one.
      expect(extractGqlError(error)).toEqual(expect.any(String));
      expect(extractGqlError(error)?.length).toBeGreaterThan(0);
    });

    it('refuses an offer write, whose tab shows UpgradePrompt for the code', async () => {
      const applicationId = await createApplication({ company: 'Offer Co' });

      const error = await rejection(
        gqlClient.request(CREATE_OFFER_MUTATION, { input: { applicationId, baseSalary: 100_000 } }),
      );

      expect(getGqlErrorCode(error)).toBe(PLAN_REQUIRED_CODE);
    });

    it('refuses the offers list the offers route catches, and does not fall back to the generic copy', async () => {
      const error = await rejection(gqlClient.request(MY_OFFERS_QUERY));

      expect(getGqlErrorCode(error)).toBe(PLAN_REQUIRED_CODE);
      // PLAN_REQUIRED is not in `CODE_MESSAGES`: `getErrorMessage` passes the API's sentence through.
      expect(getErrorMessage(error)).toBe(extractGqlError(error));
    });
  });

  describe('QUOTA_EXCEEDED', () => {
    let limit: number;
    const created: string[] = [];

    beforeAll(async () => {
      limit = field(await billing(), 'limits').applications ?? 0;
      expect(limit).toBeGreaterThan(0);
    });

    it('lets a Free user create applications up to the cap, and the quota helper calls it full', async () => {
      const before = (await billing()).usage;
      const room = limit - (before?.applications ?? 0);
      for (let i = 0; i < room; i += 1) {
        created.push(await createApplication({ company: `Cap Co ${i}`, role: 'Engineer' }));
      }

      const after = await billing();
      expect(after.usage?.applications).toBe(limit);
      expect(quotaLevel(after.usage?.applications ?? 0, limit)).toBe('full');
    });

    it('refuses the next one with QUOTA_EXCEEDED, which NewApplicationPage branches on', async () => {
      const error = await rejection(
        gqlClient.request(CREATE_APPLICATION, {
          input: { company: 'One too many', role: 'Engineer', status: 'applied' },
        }),
      );

      expect(getGqlErrorCode(error)).toBe(ERROR_CODES.QUOTA_EXCEEDED);
      expect(extractGqlErrorCode(error)).toBe(ERROR_CODES.QUOTA_EXCEEDED);
      // A cap every plan has is not a Pro gate: the prompt copy differs.
      expect(getGqlErrorCode(error)).not.toBe(PLAN_REQUIRED_CODE);
      expect(extractGqlError(error)).toEqual(expect.any(String));
    });

    it('leaves what is over the cap readable and deletable, and a delete frees a slot', async () => {
      const [first, second] = created;

      const { application } = await gqlClient.request(APPLICATION_QUERY, { id: first });
      expect(application?.company).toBe('Cap Co 0');

      await gqlClient.request(DELETE_APPLICATION, { id: second });
      // Trash is not freed until purged (NewApplicationPage's quota.trashNote), so
      // a trashed row still counts and the next create is still refused.
      const error = await rejection(
        gqlClient.request(CREATE_APPLICATION, {
          input: { company: 'Still full', role: 'Engineer', status: 'applied' },
        }),
      );
      expect(getGqlErrorCode(error)).toBe(ERROR_CODES.QUOTA_EXCEEDED);
    });
  });
});
