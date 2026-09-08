import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useCreateDocumentDraft } from '../useCreateDocumentDraft';
import { useRenameDocumentDraft } from '../useRenameDocumentDraft';
import { useDeleteDocumentDraft } from '../useDeleteDocumentDraft';
import { useUpdateDocumentDraftContent } from '../useUpdateDocumentDraftContent';

const mockedGqlRequest = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCreateDocumentDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a draft with the given input', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      createDocumentDraft: {
        id: 'draft-1',
        applicationId: 'app-1',
        type: 'resume',
        title: 'Resume',
        contentJson: '{}',
        plainText: '',
        sourceDocumentId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const { result } = await renderHook(() => useCreateDocumentDraft('app-1'), { wrapper });
    result.current.mutate({
      applicationId: 'app-1',
      type: 'resume',
      title: 'Resume',
      contentJson: '{}',
      plainText: '',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ input: expect.objectContaining({ title: 'Resume' }) }),
    );
  });
});

describe('useRenameDocumentDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renames a draft', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      renameDocumentDraft: { id: 'draft-1', title: 'New Title' },
    });

    const { result } = await renderHook(() => useRenameDocumentDraft(), { wrapper });
    result.current.mutate({ draftId: 'draft-1', title: 'New Title' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      draftId: 'draft-1',
      title: 'New Title',
    });
  });
});

describe('useDeleteDocumentDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes a draft', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ deleteDocumentDraft: true });

    const { result } = await renderHook(() => useDeleteDocumentDraft('app-1'), { wrapper });
    result.current.mutate('draft-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { id: 'draft-1' });
  });
});

describe('useUpdateDocumentDraftContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves content and returns the new updatedAt', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      updateDocumentDraftContent: { id: 'draft-1', updatedAt: '2026-01-02T00:00:00.000Z' },
    });

    const { result } = await renderHook(() => useUpdateDocumentDraftContent(), { wrapper });
    result.current.mutate({ draftId: 'draft-1', contentJson: '{}', plainText: 'hello' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'draft-1', updatedAt: '2026-01-02T00:00:00.000Z' });
  });
});
