import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useComputeResumeAtsScore } from '../useResumeAtsMutations';
import type { AtsScore } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const score: AtsScore = { score: 81, label: 'Good', readable: true, checks: [] };

describe('useComputeResumeAtsScore', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('scores a draft resume by its draft id', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeAtsScore: score });
    const { result } = await renderHook(() => useComputeResumeAtsScore(), { wrapper });

    let value;
    await act(async () => {
      value = await result.current.mutateAsync({ documentDraftId: 'draft-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation ComputeResumeAtsScore'),
      { documentDraftId: 'draft-1', documentId: null },
    );
    expect(value).toEqual(score);
  });

  it('scores an uploaded resume by its document id', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeAtsScore: score });
    const { result } = await renderHook(() => useComputeResumeAtsScore(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ documentId: 'doc-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      documentDraftId: null,
      documentId: 'doc-1',
    });
  });

  it('rejects when the request fails, leaving the cache untouched', async () => {
    mockedGqlRequest.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useComputeResumeAtsScore(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ documentId: 'doc-1' })).rejects.toThrow('boom');
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
