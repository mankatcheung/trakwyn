import { describe, expect, it, vi } from 'vitest';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { Offer } from '#src/domain/offer/Offer.js';
import { CompareOffersUseCase } from '#src/use-cases/offers/CompareOffersUseCase.js';

const makeOffer = (overrides: Partial<Offer> = {}): Offer => ({
  id: 'offer-1',
  applicationId: 'app-1',
  baseSalary: 120_000,
  bonus: 10_000,
  equity: null,
  benefits: null,
  costOfLivingAdjustment: null,
  currency: 'USD',
  period: 'yearly',
  notes: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeOfferRepository = (offers: Offer[]): IOfferRepository => ({
  findAllByApplicationId: vi.fn().mockResolvedValue(offers),
  countByApplicationId: vi.fn().mockResolvedValue(offers.length),
  findAllByUserId: vi.fn().mockResolvedValue(offers),
  findById: vi
    .fn()
    .mockImplementation((id: string) =>
      Promise.resolve(offers.find((offer) => offer.id === id) ?? null),
    ),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

const makeApplicationRepository = (): IApplicationRepository => ({
  findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
  findAllByUserId: vi.fn(),
  findPageByUserId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  reorderBoard: vi.fn(),
  findDueForReminder: vi.fn(),
  updateReminderSentAt: vi.fn(),
  findByIdIncludingTrashed: vi.fn(),
  findTrashedByUserId: vi.fn(),
  findDueForPurge: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
});

describe('CompareOffersUseCase', () => {
  it('normalizes periods and sorts by total compensation', async () => {
    const offers = [
      makeOffer({ id: 'offer-monthly', baseSalary: 10_000, bonus: 1_000, period: 'monthly' }),
      makeOffer({ id: 'offer-yearly', baseSalary: 130_000, bonus: 5_000, period: 'yearly' }),
      makeOffer({ id: 'offer-hourly', baseSalary: 60, bonus: null, period: 'hourly' }),
    ];
    const useCase = new CompareOffersUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository: makeOfferRepository(offers),
      applicationRepository: makeApplicationRepository(),
    });

    const result = await useCase.execute({
      userId: 'user-1',
      offerIds: offers.map((offer) => offer.id),
    });

    expect(result.map((comparison) => comparison.offer.id)).toEqual([
      'offer-yearly',
      'offer-monthly',
      'offer-hourly',
    ]);
    expect(result[0].normalizedYearlySalary).toBe(130_000);
    expect(result[0].totalCompensation).toBe(135_000);
    expect(result[2].normalizedYearlySalary).toBe(124_800);
  });

  it('returns an empty comparison for no selected offers', async () => {
    const useCase = new CompareOffersUseCase({
      entitlementService: makeEntitlementService(),
      offerRepository: makeOfferRepository([]),
      applicationRepository: makeApplicationRepository(),
    });

    await expect(useCase.execute({ userId: 'user-1', offerIds: [] })).resolves.toEqual([]);
  });
});
