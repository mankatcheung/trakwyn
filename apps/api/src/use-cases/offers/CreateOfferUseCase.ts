import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { Offer } from '#src/domain/offer/Offer.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type { ICreateOfferUseCase, CreateOfferInput } from './ICreateOfferUseCase.js';

interface Deps {
  entitlementService: IEntitlementService;
  offerRepository: IOfferRepository;
  applicationRepository: IApplicationRepository;
}

export class CreateOfferUseCase implements ICreateOfferUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateOfferInput): Promise<Offer> {
    await this.deps.entitlementService.assertFeature(input.userId, 'offers');
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app || app.userId !== input.userId) {
      throw new NotFoundError('Application not found');
    }

    assertUnderLimit(
      await this.deps.offerRepository.countByApplicationId(input.applicationId),
      CONTENT_LIMITS.OFFERS_PER_APPLICATION,
      'offers on this application',
    );

    const id = crypto.randomUUID();
    return this.deps.offerRepository.create({
      id,
      applicationId: input.applicationId,
      baseSalary: input.baseSalary,
      bonus: input.bonus,
      equity: input.equity,
      benefits: input.benefits,
      costOfLivingAdjustment: input.costOfLivingAdjustment,
      currency: input.currency,
      period: input.period,
      notes: input.notes,
    });
  }
}
