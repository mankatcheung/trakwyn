import type { ICreateOfferUseCase } from '#src/use-cases/offers/ICreateOfferUseCase.js';
import type { IUpdateOfferUseCase } from '#src/use-cases/offers/IUpdateOfferUseCase.js';
import type { IDeleteOfferUseCase } from '#src/use-cases/offers/IDeleteOfferUseCase.js';
import type { IGetOffersUseCase } from '#src/use-cases/offers/IGetOffersUseCase.js';
import type { IGetAllOffersUseCase } from '#src/use-cases/offers/IGetAllOffersUseCase.js';
import type { ICompareOffersUseCase } from '#src/use-cases/offers/ICompareOffersUseCase.js';
import {
  OfferMapper,
  type OfferDTO,
  type OfferWithApplicationDTO,
} from '#src/interface-adapters/mappers/OfferMapper.js';

interface Deps {
  createOfferUseCase: ICreateOfferUseCase;
  updateOfferUseCase: IUpdateOfferUseCase;
  deleteOfferUseCase: IDeleteOfferUseCase;
  getOffersUseCase: IGetOffersUseCase;
  getAllOffersUseCase: IGetAllOffersUseCase;
  compareOffersUseCase: ICompareOffersUseCase;
  offerMapper: OfferMapper;
}

export class OfferResolver {
  private readonly createOfferUseCase: ICreateOfferUseCase;
  private readonly updateOfferUseCase: IUpdateOfferUseCase;
  private readonly deleteOfferUseCase: IDeleteOfferUseCase;
  private readonly getOffersUseCase: IGetOffersUseCase;
  private readonly getAllOffersUseCase: IGetAllOffersUseCase;
  private readonly compareOffersUseCase: ICompareOffersUseCase;
  private readonly offerMapper: OfferMapper;

  constructor(deps: Deps) {
    this.createOfferUseCase = deps.createOfferUseCase;
    this.updateOfferUseCase = deps.updateOfferUseCase;
    this.deleteOfferUseCase = deps.deleteOfferUseCase;
    this.getOffersUseCase = deps.getOffersUseCase;
    this.getAllOffersUseCase = deps.getAllOffersUseCase;
    this.compareOffersUseCase = deps.compareOffersUseCase;
    this.offerMapper = deps.offerMapper;
  }

  async getOffers(userId: string, applicationId: string): Promise<OfferDTO[]> {
    const offers = await this.getOffersUseCase.execute({ userId, applicationId });
    return offers.map((offer) => this.offerMapper.toDTO(offer));
  }

  async getAllOffers(userId: string): Promise<OfferWithApplicationDTO[]> {
    const offers = await this.getAllOffersUseCase.execute({ userId });
    return offers.map((entry) => this.offerMapper.toWithApplicationDTO(entry));
  }

  async createOffer(
    userId: string,
    input: {
      applicationId: string;
      baseSalary: number;
      bonus?: number | null;
      equity?: string | null;
      benefits?: string | null;
      costOfLivingAdjustment?: number | null;
      currency?: string;
      period?: string;
      notes?: string | null;
    },
  ): Promise<OfferDTO> {
    const offer = await this.createOfferUseCase.execute({ userId, ...input });
    return this.offerMapper.toDTO(offer);
  }

  async updateOffer(
    userId: string,
    input: {
      offerId: string;
      baseSalary?: number;
      bonus?: number | null;
      equity?: string | null;
      benefits?: string | null;
      costOfLivingAdjustment?: number | null;
      currency?: string;
      period?: string;
      notes?: string | null;
    },
  ): Promise<OfferDTO> {
    const offer = await this.updateOfferUseCase.execute({ userId, ...input });
    return this.offerMapper.toDTO(offer);
  }

  async deleteOffer(userId: string, offerId: string): Promise<void> {
    await this.deleteOfferUseCase.execute({ userId, offerId });
  }

  async compareOffers(
    userId: string,
    offerIds: string[],
  ): Promise<
    Array<{
      offer: OfferDTO;
      company: string;
      role: string;
      normalizedYearlySalary: number;
      totalCompensation: number;
    }>
  > {
    const comparisons = await this.compareOffersUseCase.execute({ userId, offerIds });
    return comparisons.map((comp) => ({
      offer: this.offerMapper.toDTO(comp.offer),
      company: comp.company,
      role: comp.role,
      normalizedYearlySalary: comp.normalizedYearlySalary,
      totalCompensation: comp.totalCompensation,
    }));
  }
}
