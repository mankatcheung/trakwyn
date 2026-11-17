import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';
import type { ResultOf } from '@graphql-typed-document-node/core';

const MY_OFFERS_QUERY = graphql(`
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
`);

export const COMPARE_OFFERS_MUTATION = graphql(`
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
`);

type MyOfferEntry = NonNullable<ResultOf<typeof MY_OFFERS_QUERY>['myOffers']>[number];
type ComparedOffer = NonNullable<ResultOf<typeof COMPARE_OFFERS_MUTATION>['compareOffers']>[number];

type OfferNullable = 'bonus' | 'equity' | 'benefits' | 'costOfLivingAdjustment' | 'notes';

export type Offer = Resolved<NonNullable<MyOfferEntry['offer']>, OfferNullable>;

export type OfferWithApplication = Omit<Resolved<MyOfferEntry>, 'offer'> & { offer: Offer };

export type OfferComparison = Omit<Resolved<ComparedOffer>, 'offer'> & { offer: Offer };

export const myOffersQueryOptions = queryOptions({
  queryKey: ['myOffers'],
  queryFn: async () =>
    (await gqlClient.request(MY_OFFERS_QUERY)) as { myOffers: OfferWithApplication[] },
});
