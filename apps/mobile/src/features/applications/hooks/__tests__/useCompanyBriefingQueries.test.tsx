import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useCompanyBriefing } from '../useCompanyBriefingQueries';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCompanyBriefing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the company briefing for an application', async () => {
    const briefing = {
      id: 'b1',
      applicationId: '1',
      content: 'Some briefing content.',
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockedGqlRequest.mockResolvedValueOnce({ companyBriefing: briefing });

    const { result } = await renderHook(() => useCompanyBriefing('1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(briefing);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { applicationId: '1' });
  });

  it('does not fetch when the applicationId is empty', async () => {
    const { result } = await renderHook(() => useCompanyBriefing(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});
