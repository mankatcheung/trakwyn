import { describe, it, expect, vi } from 'vitest';
import { GetAllOffersUseCase } from '#src/use-cases/offers/GetAllOffersUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeOffer, makeOfferRepository } from '#src/__tests__/helpers/mocks/offers.js';

describe('GetAllOffersUseCase', () => {
  it('returns an empty array when the user has no offers', async () => {
    const offerRepository = makeOfferRepository({ findAllByUserId: vi.fn().mockResolvedValue([]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetAllOffersUseCase({
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });

  it('pairs every offer with its application company and role, across applications', async () => {
    const apps = [
      makeApplication({ id: 'app-1', company: 'Acme', role: 'Engineer' }),
      makeApplication({ id: 'app-2', company: 'Globex', role: 'Staff Engineer' }),
    ];
    const offers = [
      makeOffer({ id: 'offer-1', applicationId: 'app-1' }),
      makeOffer({ id: 'offer-2', applicationId: 'app-2' }),
    ];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetAllOffersUseCase({
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([
      { offer: offers[0], company: 'Acme', role: 'Engineer' },
      { offer: offers[1], company: 'Globex', role: 'Staff Engineer' },
    ]);
  });

  it('skips offers whose application no longer exists', async () => {
    const offers = [makeOffer({ id: 'offer-1', applicationId: 'missing-app' })];
    const offerRepository = makeOfferRepository({
      findAllByUserId: vi.fn().mockResolvedValue(offers),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetAllOffersUseCase({
      offerRepository,
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual([]);
  });
});
