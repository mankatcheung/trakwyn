import { describe, it, expect, vi } from 'vitest';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { GetOfferAnalyticsUseCase } from '#src/use-cases/offers/GetOfferAnalyticsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeOffer, makeOfferRepository } from '#src/__tests__/helpers/mocks/offers.js';

describe('GetOfferAnalyticsUseCase', () => {
  it('returns empty trend and byCurrency when there are no offers', async () => {
    const offerRepository = makeOfferRepository({ findAllByUserId: vi.fn().mockResolvedValue([]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetOfferAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual({ trend: [], byCurrency: [] });
  });

  it('normalizes each offer to an annualized salary and orders the trend chronologically', async () => {
    const apps = [
      makeApplication({ id: 'app-1', company: 'Acme', role: 'Engineer' }),
      makeApplication({ id: 'app-2', company: 'Globex', role: 'Staff Engineer' }),
    ];
    const offers = [
      makeOffer({
        id: 'offer-2',
        applicationId: 'app-2',
        baseSalary: 130_000,
        period: 'yearly',
        currency: 'USD',
        createdAt: new Date('2024-02-01'),
      }),
      makeOffer({
        id: 'offer-1',
        applicationId: 'app-1',
        baseSalary: 10_000,
        period: 'monthly',
        currency: 'USD',
        createdAt: new Date('2024-01-01'),
      }),
    ];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetOfferAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.trend).toEqual([
      {
        offerId: 'offer-1',
        applicationId: 'app-1',
        company: 'Acme',
        role: 'Engineer',
        createdAt: new Date('2024-01-01').toISOString(),
        currency: 'USD',
        normalizedYearlySalary: 120_000,
      },
      {
        offerId: 'offer-2',
        applicationId: 'app-2',
        company: 'Globex',
        role: 'Staff Engineer',
        createdAt: new Date('2024-02-01').toISOString(),
        currency: 'USD',
        normalizedYearlySalary: 130_000,
      },
    ]);
  });

  it('groups stats by currency without mixing them together', async () => {
    const apps = [
      makeApplication({ id: 'app-1' }),
      makeApplication({ id: 'app-2' }),
      makeApplication({ id: 'app-3' }),
    ];
    const offers = [
      makeOffer({ id: 'o1', applicationId: 'app-1', baseSalary: 100_000, currency: 'USD' }),
      makeOffer({ id: 'o2', applicationId: 'app-2', baseSalary: 120_000, currency: 'USD' }),
      makeOffer({ id: 'o3', applicationId: 'app-3', baseSalary: 80_000, currency: 'GBP' }),
    ];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetOfferAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.byCurrency).toEqual([
      {
        currency: 'USD',
        count: 2,
        minYearlySalary: 100_000,
        maxYearlySalary: 120_000,
        medianYearlySalary: 110_000,
        averageYearlySalary: 110_000,
      },
      {
        currency: 'GBP',
        count: 1,
        minYearlySalary: 80_000,
        maxYearlySalary: 80_000,
        medianYearlySalary: 80_000,
        averageYearlySalary: 80_000,
      },
    ]);
  });

  it('skips offers whose application no longer exists', async () => {
    const offers = [makeOffer({ id: 'o1', applicationId: 'missing-app' })];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetOfferAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual({ trend: [], byCurrency: [] });
  });

  it('normalizes hourly and weekly periods to a yearly figure', async () => {
    const apps = [makeApplication({ id: 'app-1' }), makeApplication({ id: 'app-2' })];
    const offers = [
      makeOffer({ id: 'o1', applicationId: 'app-1', baseSalary: 60, period: 'hourly' }),
      makeOffer({ id: 'o2', applicationId: 'app-2', baseSalary: 2_000, period: 'weekly' }),
    ];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetOfferAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.trend.map((t) => t.normalizedYearlySalary)).toEqual([124_800, 104_000]);
  });
});
