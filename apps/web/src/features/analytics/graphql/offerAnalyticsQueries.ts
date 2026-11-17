import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const OFFER_ANALYTICS_QUERY = `
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
`;

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
  queryFn: () => gqlClient.request<{ offerAnalytics: OfferAnalytics }>(OFFER_ANALYTICS_QUERY),
});
