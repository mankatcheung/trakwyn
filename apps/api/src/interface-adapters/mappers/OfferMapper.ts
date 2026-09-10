import type { Offer } from '#src/domain/offer/Offer.js';
import type { OfferWithApplication } from '#src/use-cases/offers/IGetAllOffersUseCase.js';

export interface OfferDTO {
  id: string;
  applicationId: string;
  baseSalary: number;
  bonus: number | null;
  equity: string | null;
  benefits: string | null;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferWithApplicationDTO {
  offer: OfferDTO;
  company: string;
  role: string;
}

export class OfferMapper {
  toWithApplicationDTO(entry: OfferWithApplication): OfferWithApplicationDTO {
    return {
      offer: this.toDTO(entry.offer),
      company: entry.company,
      role: entry.role,
    };
  }

  toDTO(offer: Offer): OfferDTO {
    return {
      id: offer.id,
      applicationId: offer.applicationId,
      baseSalary: offer.baseSalary,
      bonus: offer.bonus,
      equity: offer.equity,
      benefits: offer.benefits,
      costOfLivingAdjustment: offer.costOfLivingAdjustment,
      currency: offer.currency,
      period: offer.period,
      notes: offer.notes,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    };
  }
}
