import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useComputeResumeMatchScore } from '../useResumeMatchMutations';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useComputeResumeMatchScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes a resume match score', async () => {
    const scoreResult = {
      score: 82,
      label: 'Strong match',
      matchedKeywords: ['React'],
      missingKeywords: ['GraphQL'],
      summary: 'Good overlap.',
    };
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeMatchScore: scoreResult });
    const { result } = await renderHook(() => useComputeResumeMatchScore('1'), { wrapper });

    let value;
    await act(async () => {
      value = await result.current.mutateAsync('My resume text');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      resumeText: 'My resume text',
    });
    expect(value).toEqual(scoreResult);
  });
});
