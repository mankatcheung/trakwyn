import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useDocumentDraft, useDocumentDrafts } from '../useDocumentDraftQueries';
import type { DocumentDraft, DocumentDraftSummary } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const draftSummary: DocumentDraftSummary = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'cover_letter',
  title: 'Cover Letter — Acme Corp',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const draft: DocumentDraft = {
  ...draftSummary,
  contentJson: '{"type":"doc","content":[]}',
  plainText: '',
  sourceDocumentId: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useDocumentDrafts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches drafts for an application', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ documentDrafts: [draftSummary] });

    const { result } = await renderHook(() => useDocumentDrafts('app-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([draftSummary]);
  });

  it('does not fetch when the application id is empty', async () => {
    const { result } = await renderHook(() => useDocumentDrafts(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});

describe('useDocumentDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a single draft by id', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ documentDraft: draft });

    const { result } = await renderHook(() => useDocumentDraft('draft-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(draft);
  });

  it('does not fetch when the draft id is empty', async () => {
    const { result } = await renderHook(() => useDocumentDraft(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});
