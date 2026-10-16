import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useComputeResumeMatchScore } from '../useResumeMatchMutations';
import { resumeMatchesQueryKey } from '../useResumeMatchQueries';
import type { ResumeMatch } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const match = (overrides: Partial<ResumeMatch> = {}): ResumeMatch => ({
  id: 'match-1',
  applicationId: '1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 82,
  label: 'Good match',
  matchedKeywords: ['React'],
  missingKeywords: ['GraphQL'],
  summary: 'Good overlap.',
  generatedAt: '2026-10-12T12:00:00.000Z',
  isStale: false,
  ...overrides,
});

describe('useComputeResumeMatchScore', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('scores a draft resume', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeMatchScore: match() });
    const { result } = await renderHook(() => useComputeResumeMatchScore('1'), { wrapper });

    let value;
    await act(async () => {
      value = await result.current.mutateAsync({ documentDraftId: 'draft-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      documentDraftId: 'draft-1',
      documentId: null,
    });
    expect(value).toEqual(match());
  });

  it('scores an uploaded resume by its document id', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      computeResumeMatchScore: match({ documentDraftId: null, documentId: 'doc-1' }),
    });
    const { result } = await renderHook(() => useComputeResumeMatchScore('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ documentId: 'doc-1' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      documentDraftId: null,
      documentId: 'doc-1',
    });
  });

  it("stores the result in the cached list, replacing that resume's old match", async () => {
    const stale = match({ id: 'old', score: 40, isStale: true });
    const other = match({ id: 'other', documentDraftId: 'draft-2' });
    queryClient.setQueryData(resumeMatchesQueryKey('1'), [stale, other]);
    const fresh = match({ id: 'new', score: 90 });
    mockedGqlRequest.mockResolvedValueOnce({ computeResumeMatchScore: fresh });
    const { result } = await renderHook(() => useComputeResumeMatchScore('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ documentDraftId: 'draft-1' });
    });

    expect(queryClient.getQueryData(resumeMatchesQueryKey('1'))).toEqual([other, fresh]);
  });

  it('leaves the cached match alone when scoring fails', async () => {
    queryClient.setQueryData(resumeMatchesQueryKey('1'), [match()]);
    mockedGqlRequest.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useComputeResumeMatchScore('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ documentDraftId: 'draft-1' }).catch(() => {});
    });

    expect(queryClient.getQueryData(resumeMatchesQueryKey('1'))).toEqual([match()]);
  });
});
