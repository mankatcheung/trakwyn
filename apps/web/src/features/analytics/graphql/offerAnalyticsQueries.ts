import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

const OFFER_ANALYTICS_QUERY = graphql(`
  query OfferAnalytics {
    offerAnalytics {
      trend {
        offerId
        applicationId
        company
        role
        createdAt
        currency
        normalizedYearlySalary
      }
      byCurrency {
        currency
        count
        minYearlySalary
        maxYearlySalary
        medianYearlySalary
        averageYearlySalary
      }
    }
  }
`);

export interface OfferTrendPoint {
  offerId: string;
  applicationId: string;
  company: string;
  role: string;
  createdAt: string;
  currency: string;
  normalizedYearlySalary: number;
}

export interface CurrencyGroupStat {
  currency: string;
  count: number;
  minYearlySalary: number;
  maxYearlySalary: number;
  medianYearlySalary: number;
  averageYearlySalary: number;
}

export interface OfferAnalytics {
  trend: OfferTrendPoint[];
  byCurrency: CurrencyGroupStat[];
}

export const offerAnalyticsQueryOptions = queryOptions({
  queryKey: ['offerAnalytics'],
  queryFn: async () =>
    (await gqlClient.request(OFFER_ANALYTICS_QUERY)) as { offerAnalytics: OfferAnalytics },
});
