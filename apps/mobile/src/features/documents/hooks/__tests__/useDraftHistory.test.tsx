import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useCreateDraftVersion,
  useDraftVersion,
  useDraftVersions,
  useRestoreDraftVersion,
} from '../useDraftHistory';

const mockedGqlRequest = jest.mocked(gqlRequest);

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

const versions = [
  { id: 'v2', source: 'ai', characterCount: 12, createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'v1', source: 'autosave', characterCount: 8, createdAt: '2026-01-01T00:00:00.000Z' },
];

describe('draft history hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the versions of a draft once enabled', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ documentDraftVersions: versions });
    const { wrapper } = makeWrapper();
    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useDraftVersions('d1', enabled),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGqlRequest).not.toHaveBeenCalled();

    await rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(versions);
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('documentDraftVersions'),
      {
        draftId: 'd1',
      },
    );
  });

  it('fetches one version only when one is selected', async () => {
    const full = { ...versions[0], contentJson: '{}', plainText: 'Hello' };
    mockedGqlRequest.mockResolvedValueOnce({ documentDraftVersion: full });
    const { wrapper } = makeWrapper();
    const none = await renderHook(() => useDraftVersion(null), { wrapper });
    expect(none.result.current.fetchStatus).toBe('idle');

    const { result } = await renderHook(() => useDraftVersion('v2'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(full);
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('documentDraftVersion('),
      {
        id: 'v2',
      },
    );
  });

  it('saves a version and refreshes the list', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      createDocumentDraftVersion: { id: 'v3', source: 'manual' },
    });
    const { wrapper, invalidate } = makeWrapper();
    const { result } = await renderHook(() => useCreateDraftVersion('d1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('createDocumentDraftVersion'),
      { draftId: 'd1' },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['draftVersions', 'd1'] });
  });

  it('restores a version, returns the draft and refreshes the list and the draft', async () => {
    const restored = { id: 'd1', contentJson: '{}', plainText: 'Old', updatedAt: 'now' };
    mockedGqlRequest.mockResolvedValueOnce({ restoreDocumentDraftVersion: restored });
    const { wrapper, invalidate } = makeWrapper();
    const { result } = await renderHook(() => useRestoreDraftVersion('d1'), { wrapper });
    let value;
    await act(async () => {
      value = await result.current.mutateAsync('v1');
    });

    expect(value).toEqual(restored);
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('restoreDocumentDraftVersion'),
      { versionId: 'v1' },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['draftVersions', 'd1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documentDraft', 'd1'] });
  });
});
