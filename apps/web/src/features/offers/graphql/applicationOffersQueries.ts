import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { myOffersQueryOptions } from './offersQueries';
import { invalidateSectionCounts } from '../../../routes/_authenticated/applications/$applicationId/-sectionCounts';

const OFFERS_QUERY = `
  query Offers($applicationId: ID!) {
    offers(applicationId: $applicationId) {
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
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_OFFER_MUTATION = `
  mutation CreateOffer($input: CreateOfferInput!) {
    createOffer(input: $input) {
      id
    }
  }
`;

export const UPDATE_OFFER_MUTATION = `
  mutation UpdateOffer($input: UpdateOfferInput!) {
    updateOffer(input: $input) {
      id
    }
  }
`;

export const DELETE_OFFER_MUTATION = `
  mutation DeleteOffer($id: ID!) {
    deleteOffer(id: $id)
  }
`;

export interface ApplicationOffer {
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

/** What `OfferForm` hands the page to save. */
export interface OfferInput {
  baseSalary: number;
  bonus: number | null;
  equity: string;
  benefits: string;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: string;
  notes: string;
}

/** One application's offers; its own key, apart from the cross-application `myOffers`. */
export const applicationOffersQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: ['offers', applicationId],
    queryFn: () =>
      gqlClient.request<{ offers: ApplicationOffer[] }>(OFFERS_QUERY, { applicationId }),
  });

/**
 * After any offer write: this application's list, the `/offers` page that
 * reads every application's offers, and the tab badge.
 */
export function invalidateOffers(qc: QueryClient, applicationId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: applicationOffersQueryOptions(applicationId).queryKey }),
    qc.invalidateQueries({ queryKey: myOffersQueryOptions.queryKey }),
    invalidateSectionCounts(qc, applicationId),
  ]);
}
