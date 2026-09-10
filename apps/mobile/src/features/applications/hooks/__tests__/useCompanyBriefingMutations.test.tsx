import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useGenerateCompanyBriefing } from '../useCompanyBriefingMutations';
import { companyBriefingQueryKey } from '../useCompanyBriefingQueries';

const mockedGqlRequest = jest.mocked(gqlRequest);

describe('useGenerateCompanyBriefing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a company briefing and caches the result', async () => {
    const briefing = {
      id: 'b1',
      applicationId: '1',
      content: 'Some briefing content.',
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockedGqlRequest.mockResolvedValueOnce({ generateCompanyBriefing: briefing });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useGenerateCompanyBriefing('1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { applicationId: '1' });
    expect(queryClient.getQueryData(companyBriefingQueryKey('1'))).toEqual(briefing);
  });
});
