import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { findResumeAtsScore, useResumeAtsScores } from '../useResumeAtsQueries';
import type { AtsScore } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const score = (overrides: Partial<AtsScore> = {}): AtsScore => ({
  id: 'ats-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 81,
  label: 'Good',
  readable: true,
  checks: [],
  generatedAt: '2026-10-14T12:00:00.000Z',
  isStale: false,
  ...overrides,
});

describe('useResumeAtsScores', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => jest.clearAllMocks());

  it("loads an application's saved results", async () => {
    mockedGqlRequest.mockResolvedValueOnce({ resumeAtsScores: [score()] });
    const { result } = await renderHook(() => useResumeAtsScores('app-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([score()]));
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query ResumeAtsScores'),
      { applicationId: 'app-1' },
    );
  });

  it('does not query without an application id', async () => {
    await renderHook(() => useResumeAtsScores(''), { wrapper });
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});

describe('findResumeAtsScore', () => {
  const scores = [score(), score({ id: 'ats-2', documentDraftId: null, documentId: 'doc-1' })];

  it('finds a draft by its draft id and an upload by its document id', () => {
    expect(findResumeAtsScore(scores, { documentDraftId: 'draft-1' })?.id).toBe('ats-1');
    expect(findResumeAtsScore(scores, { documentId: 'doc-1' })?.id).toBe('ats-2');
  });

  it('finds nothing for an unchecked resume or before the list loads', () => {
    expect(findResumeAtsScore(scores, { documentDraftId: 'draft-9' })).toBeUndefined();
    expect(findResumeAtsScore(undefined, { documentDraftId: 'draft-1' })).toBeUndefined();
  });
});
