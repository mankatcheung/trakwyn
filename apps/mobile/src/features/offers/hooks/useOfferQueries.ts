import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  COMPARE_OFFERS_MUTATION,
  CREATE_OFFER_MUTATION,
  DELETE_OFFER_MUTATION,
  MY_OFFERS_QUERY,
  OFFERS_QUERY,
  UPDATE_OFFER_MUTATION,
} from '../graphql/operations';
import type { Offer, OfferComparison, OfferFormData, OfferWithApplication } from '../types';

export const offersQueryKey = (applicationId: string) => ['offers', applicationId] as const;
export const allOffersQueryKey = ['offers', 'all'] as const;

export function useOffers(applicationId: string) {
  return useQuery({
    queryKey: offersQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ offers: Offer[] }>(OFFERS_QUERY, { applicationId }).then((d) => d.offers),
  });
}

export function useAllOffers() {
  return useQuery({
    queryKey: allOffersQueryKey,
    queryFn: () =>
      gqlRequest<{ myOffers: OfferWithApplication[] }>(MY_OFFERS_QUERY).then((d) => d.myOffers),
  });
}

export function useCreateOffer(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OfferFormData) =>
      gqlRequest(CREATE_OFFER_MUTATION, { input: { applicationId, ...data } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: offersQueryKey(applicationId) }),
  });
}

export function useUpdateOffer(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, data }: { offerId: string; data: OfferFormData }) =>
      gqlRequest(UPDATE_OFFER_MUTATION, { input: { offerId, ...data } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: offersQueryKey(applicationId) }),
  });
}

export function useDeleteOffer(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gqlRequest(DELETE_OFFER_MUTATION, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: offersQueryKey(applicationId) }),
  });
}

export function useCompareOffers() {
  return useMutation({
    mutationFn: (offerIds: string[]) =>
      gqlRequest<{ compareOffers: OfferComparison[] }>(COMPARE_OFFERS_MUTATION, {
        offerIds,
      }).then((d) => d.compareOffers),
  });
}
