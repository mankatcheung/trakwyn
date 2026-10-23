import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { OfferPeriod } from '#src/domain/offer/Offer.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';
import type {
  ICompareOffersUseCase,
  CompareOffersInput,
  OfferComparison,
} from './ICompareOffersUseCase.js';

interface Deps {
  entitlementService: IEntitlementService;
  offerRepository: IOfferRepository;
  applicationRepository: IApplicationRepository;
}

function normalizeToYearly(amount: number, period: OfferPeriod): number {
  switch (period) {
    case 'yearly':
      return amount;
    case 'monthly':
      return amount * 12;
    case 'weekly':
      return amount * 52;
    case 'hourly':
      return amount * 2080; // 40 hours/week * 52 weeks
    default:
      return amount;
  }
}

export class CompareOffersUseCase implements ICompareOffersUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CompareOffersInput): Promise<OfferComparison[]> {
    await this.deps.entitlementService.assertFeature(input.userId, 'offers');
    if (input.offerIds.length === 0) {
      return [];
    }

    const comparisons: OfferComparison[] = [];

    for (const offerId of input.offerIds) {
      const offer = await this.deps.offerRepository.findById(offerId);
      if (!offer) {
        throw new NotFoundError(`Offer ${offerId} not found`);
      }

      const app = await this.deps.applicationRepository.findById(offer.applicationId);
      if (!app || app.userId !== input.userId) {
        throw new ForbiddenError(`Not authorized for offer ${offerId}`);
      }

      const normalizedYearlySalary = normalizeToYearly(offer.baseSalary, offer.period);
      const yearlyBonus = offer.bonus ? normalizeToYearly(offer.bonus, offer.period) : 0;
      const totalCompensation = normalizedYearlySalary + yearlyBonus;

      comparisons.push({
        offer,
        company: app.company,
        role: app.role,
        normalizedYearlySalary,
        totalCompensation,
      });
    }

    // Sort by total compensation descending
    comparisons.sort((a, b) => b.totalCompensation - a.totalCompensation);

    return comparisons;
  }
}
