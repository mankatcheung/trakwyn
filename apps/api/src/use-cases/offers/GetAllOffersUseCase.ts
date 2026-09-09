import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type {
  IGetAllOffersUseCase,
  GetAllOffersInput,
  OfferWithApplication,
} from './IGetAllOffersUseCase.js';

interface Deps {
  offerRepository: IOfferRepository;
  applicationRepository: IApplicationRepository;
}

/** Every offer the user has logged, across every (non-trashed) application. */
export class GetAllOffersUseCase implements IGetAllOffersUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetAllOffersInput): Promise<OfferWithApplication[]> {
    const [offers, applications] = await Promise.all([
      this.deps.offerRepository.findAllByUserId(input.userId),
      this.deps.applicationRepository.findAllByUserId(input.userId),
    ]);

    const applicationById = new Map(applications.map((a) => [a.id, a]));

    return offers.flatMap((offer) => {
      const application = applicationById.get(offer.applicationId);
      if (!application) return [];
      return [{ offer, company: application.company, role: application.role }];
    });
  }
}
