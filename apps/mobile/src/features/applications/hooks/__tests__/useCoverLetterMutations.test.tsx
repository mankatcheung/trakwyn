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
      draft = await result.current.mutateAsync({ resumeDraftId: 'resume-draft-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      resumeDocumentId: null,
      resumeDraftId: 'resume-draft-1',
    });
    expect(draft).toEqual({
      id: 'd1',
      title: 'Cover Letter',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('sends an uploaded resume as a document id', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      generateCoverLetter: { id: 'd2', title: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const { result } = await renderHook(() => useGenerateCoverLetter('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ resumeDocumentId: 'file-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      resumeDocumentId: 'file-1',
      resumeDraftId: null,
    });
  });

  it('generates from the saved profile alone when no resume is chosen', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      generateCoverLetter: { id: 'd3', title: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    const { result } = await renderHook(() => useGenerateCoverLetter('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({});
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      resumeDocumentId: null,
      resumeDraftId: null,
    });
  });
});
