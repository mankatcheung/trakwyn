import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useDismissOnboardingChecklist, useOnboardingChecklist } from '../useDashboardQueries';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useOnboardingChecklist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the checklist data', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      me: { onboardingChecklistDismissedAt: null },
      apiTokens: [],
      llmApiKeys: [],
      workExperiences: [{ id: 'exp-1' }],
    });

    const { result } = await renderHook(() => useOnboardingChecklist(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      me: { onboardingChecklistDismissedAt: null },
      apiTokens: [],
      llmApiKeys: [],
      workExperiences: [{ id: 'exp-1' }],
    });
  });

  it('dismisses the checklist', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ dismissOnboardingChecklist: true });
    const { result } = await renderHook(() => useDismissOnboardingChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('dismissOnboardingChecklist'),
    );
  });
});
