import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useGenerateCoverLetter } from '../useCoverLetterMutations';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGenerateCoverLetter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a cover letter draft', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      generateCoverLetter: {
        id: 'd1',
        title: 'Cover Letter',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const { result } = await renderHook(() => useGenerateCoverLetter('1'), { wrapper });

    let draft;
    await act(async () => {
      draft = await result.current.mutateAsync('My resume text');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      resumeText: 'My resume text',
    });
    expect(draft).toEqual({
      id: 'd1',
      title: 'Cover Letter',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
