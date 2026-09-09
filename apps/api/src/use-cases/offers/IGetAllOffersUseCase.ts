import type { Offer } from '#src/domain/offer/Offer.js';

export interface OfferWithApplication {
  offer: Offer;
  company: string;
  role: string;
}

export interface GetAllOffersInput {
  userId: string;
}

export interface IGetAllOffersUseCase {
  execute(input: GetAllOffersInput): Promise<OfferWithApplication[]>;
}
