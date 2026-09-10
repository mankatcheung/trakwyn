import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const MY_OFFERS_QUERY = `
  query MyOffers {
    myOffers {
      company
      role
      offer {
        id
        applicationId
        baseSalary
        bonus
        equity
        benefits
        costOfLivingAdjustment
        currency
        period
        notes
      }
    }
  }
`;

export const COMPARE_OFFERS_MUTATION = `
  mutation CompareOffers($offerIds: [String!]!) {
    compareOffers(offerIds: $offerIds) {
      offer {
        id
        baseSalary
        bonus
        equity
        benefits
        costOfLivingAdjustment
        currency
        period
      }
      company
      role
      normalizedYearlySalary
      totalCompensation
    }
  }
`;

export interface Offer {
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
}

export interface OfferWithApplication {
  company: string;
  role: string;
  offer: Offer;
}

export interface OfferComparison {
  offer: Offer;
  company: string;
  role: string;
  normalizedYearlySalary: number;
  totalCompensation: number;
}

export const myOffersQueryOptions = queryOptions({
  queryKey: ['myOffers'],
  queryFn: () => gqlClient.request<{ myOffers: OfferWithApplication[] }>(MY_OFFERS_QUERY),
});
