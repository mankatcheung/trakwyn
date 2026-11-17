import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';
import type { ResultOf } from '@graphql-typed-document-node/core';
import { myOffersQueryOptions } from './offersQueries';
import { invalidateSectionCounts } from '../../application-detail/lib/sectionCounts';

const OFFERS_QUERY = graphql(`
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
`);

export const CREATE_OFFER_MUTATION = graphql(`
  mutation CreateOffer($input: CreateOfferInput!) {
    createOffer(input: $input) {
      id
    }
  }
`);

export const UPDATE_OFFER_MUTATION = graphql(`
  mutation UpdateOffer($input: UpdateOfferInput!) {
    updateOffer(input: $input) {
      id
    }
  }
`);

export const DELETE_OFFER_MUTATION = graphql(`
  mutation DeleteOffer($id: String!) {
    deleteOffer(id: $id)
  }
`);

export type ApplicationOffer = Resolved<
  NonNullable<ResultOf<typeof OFFERS_QUERY>['offers']>[number],
  'bonus' | 'equity' | 'benefits' | 'costOfLivingAdjustment' | 'notes'
>;

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
    queryFn: async () =>
      (await gqlClient.request(OFFERS_QUERY, { applicationId })) as { offers: ApplicationOffer[] },
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
