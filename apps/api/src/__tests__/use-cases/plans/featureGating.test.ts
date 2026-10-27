import { describe, expect, it, vi } from 'vitest';
import type { PlanFeature } from '#src/domain/plan/Plan.js';
import { PlanRequiredError } from '#src/use-cases/errors/DomainError.js';
import { GetAllOffersUseCase } from '#src/use-cases/offers/GetAllOffersUseCase.js';
import { CompareOffersUseCase } from '#src/use-cases/offers/CompareOffersUseCase.js';
import { CreateOfferUseCase } from '#src/use-cases/offers/CreateOfferUseCase.js';
import { GetOfferAnalyticsUseCase } from '#src/use-cases/offers/GetOfferAnalyticsUseCase.js';
import { GetApplicationChannelAnalyticsUseCase } from '#src/use-cases/application/GetApplicationChannelAnalyticsUseCase.js';
import { GetDocumentVersionOutcomesUseCase } from '#src/use-cases/documents/GetDocumentVersionOutcomesUseCase.js';
import { CreateShareLinkUseCase } from '#src/use-cases/shareLinks/CreateShareLinkUseCase.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';

/**
 * Anything the use case reaches for before the plan check has run fails the
 * test, so "refused first" is asserted, not assumed.
 */
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error('a dependency was used before the plan check');
    },
  },
) as never;

interface Gated {
  name: string;
  feature: PlanFeature;
  run: (entitlementService: ReturnType<typeof makeEntitlementService>) => Promise<unknown>;
}

const GATED: Gated[] = [
  {
    name: 'GetAllOffersUseCase',
    feature: 'offers',
    run: (entitlementService) =>
      new GetAllOffersUseCase({
        entitlementService,
        offerRepository: untouchable,
        applicationRepository: untouchable,
      }).execute({ userId: 'user-1' }),
  },
  {
    name: 'CompareOffersUseCase',
    feature: 'offers',
    run: (entitlementService) =>
      new CompareOffersUseCase({
        entitlementService,
        offerRepository: untouchable,
        applicationRepository: untouchable,
      }).execute({ userId: 'user-1', offerIds: ['o-1', 'o-2'] }),
  },
  {
    name: 'CreateOfferUseCase',
    feature: 'offers',
    run: (entitlementService) =>
      new CreateOfferUseCase({
        entitlementService,
        offerRepository: untouchable,
        applicationRepository: untouchable,
      }).execute({
        userId: 'user-1',
        applicationId: 'app-1',
        baseSalary: 100000,
        currency: 'USD',
        period: 'yearly',
      } as never),
  },
  {
    name: 'GetOfferAnalyticsUseCase',
    feature: 'analytics',
    run: (entitlementService) =>
      new GetOfferAnalyticsUseCase({
        entitlementService,
        offerRepository: untouchable,
        applicationRepository: untouchable,
      }).execute({ userId: 'user-1' }),
  },
  {
    name: 'GetApplicationChannelAnalyticsUseCase',
    feature: 'analytics',
    run: (entitlementService) =>
      new GetApplicationChannelAnalyticsUseCase({
        entitlementService,
        applicationRepository: untouchable,
      }).execute({ userId: 'user-1' }),
  },
  {
    name: 'GetDocumentVersionOutcomesUseCase',
    feature: 'analytics',
    run: (entitlementService) =>
      new GetDocumentVersionOutcomesUseCase({
        entitlementService,
        documentRepository: untouchable,
        interviewRoundRepository: untouchable,
      }).execute({ userId: 'user-1' }),
  },
  {
    name: 'CreateShareLinkUseCase',
    feature: 'shareLinks',
    run: (entitlementService) =>
      new CreateShareLinkUseCase({
        entitlementService,
        shareLinkRepository: untouchable,
        generateId: vi.fn(),
      }).execute({ userId: 'user-1', name: 'For my coach' }),
  },
];

describe('Pro features are refused to a Free user before any work is done', () => {
  it.each(GATED)('$name needs the $feature feature', async ({ run, feature }) => {
    const entitlementService = makeEntitlementService({
      assertFeature: vi.fn().mockRejectedValue(new PlanRequiredError('Pro only')),
    });

    await expect(run(entitlementService)).rejects.toBeInstanceOf(PlanRequiredError);
    expect(entitlementService.assertFeature).toHaveBeenCalledWith('user-1', feature);
  });
});
