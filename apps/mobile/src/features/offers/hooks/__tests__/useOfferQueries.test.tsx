import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useAllOffers,
  useCompareOffers,
  useCreateOffer,
  useDeleteOffer,
  useOffers,
  useUpdateOffer,
} from '../useOfferQueries';
import type { OfferFormData } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const offerData: OfferFormData = {
  baseSalary: 150000,
  bonus: 10000,
  equity: '0.1%',
  benefits: 'Health, dental',
  costOfLivingAdjustment: null,
  currency: 'USD',
  period: 'yearly',
  notes: '',
};

describe('useOffers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches offers for an application', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      offers: [{ id: '1', applicationId: 'app-1', baseSalary: 150000 }],
    });

    const { result } = await renderHook(() => useOffers('app-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { applicationId: 'app-1' });
  });
});

describe('useAllOffers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches offers across every application, not scoped to one', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      myOffers: [
        {
          company: 'Acme',
          role: 'Engineer',
          offer: { id: '1', applicationId: 'app-1', baseSalary: 150000 },
        },
      ],
    });

    const { result } = await renderHook(() => useAllOffers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String));
    expect(result.current.data?.[0]?.company).toBe('Acme');
  });
});

describe('useCreateOffer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an offer for the given application', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ createOffer: { id: '1' } });
    const { result } = await renderHook(() => useCreateOffer('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(offerData);
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      input: { applicationId: 'app-1', ...offerData },
    });
  });
});

describe('useUpdateOffer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates an existing offer', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateOffer: { id: 'offer-1' } });
    const { result } = await renderHook(() => useUpdateOffer('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ offerId: 'offer-1', data: offerData });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      input: { offerId: 'offer-1', ...offerData },
    });
  });
});

describe('useDeleteOffer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes an offer', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ deleteOffer: true });
    const { result } = await renderHook(() => useDeleteOffer('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('offer-1');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { id: 'offer-1' });
  });
});

describe('useCompareOffers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('compares the given offer ids', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ compareOffers: [] });
    const { result } = await renderHook(() => useCompareOffers(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(['1', '2']);
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { offerIds: ['1', '2'] });
  });
});
