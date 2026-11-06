import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

import { useRouter } from 'expo-router';
import { gqlRequest } from '../../../../graphql/client';
import { findBlankDraft, isBlankDraft, useCreateOrOpenDraft } from '../useCreateOrOpenDraft';

const mockedGql = jest.mocked(gqlRequest);
const push = jest.fn();

const summary = (id: string, type: string, plainText: string | undefined, updatedAt: string) => ({
  id,
  applicationId: 'app-1',
  type,
  title: 't',
  createdAt: updatedAt,
  updatedAt,
  plainText,
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('findBlankDraft', () => {
  it('treats an unknown text as not blank', () => {
    expect(isBlankDraft({ plainText: undefined })).toBe(false);
    expect(isBlankDraft({ plainText: '  \n' })).toBe(true);
  });

  it('picks the most recently updated blank draft of the type', () => {
    const drafts = [
      summary('old', 'resume', '', '2026-01-01T00:00:00.000Z'),
      summary('new', 'resume', '', '2026-02-01T00:00:00.000Z'),
      summary('letter', 'cover_letter', '', '2026-03-01T00:00:00.000Z'),
      summary('text', 'resume', 'words', '2026-04-01T00:00:00.000Z'),
    ];
    expect(findBlankDraft(drafts, 'resume')?.id).toBe('new');
    expect(findBlankDraft(drafts, 'cover_letter')?.id).toBe('letter');
    expect(findBlankDraft([drafts[3]], 'resume')).toBeUndefined();
  });
});

describe('useCreateOrOpenDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useRouter).mockReturnValue({ push } as never);
  });

  it('opens the blank draft instead of creating another', async () => {
    mockedGql.mockResolvedValueOnce({
      documentDrafts: [summary('blank-1', 'resume', '', '2026-01-01T00:00:00.000Z')],
    });

    const { result } = await renderHook(() => useCreateOrOpenDraft('app-1', 'resume'), { wrapper });
    await act(async () => result.current.run());

    expect(mockedGql).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('./documents/blank-1');
  });

  it('creates a draft titled with the type label when none is blank', async () => {
    mockedGql
      .mockResolvedValueOnce({
        documentDrafts: [summary('d1', 'resume', 'has text', '2026-01-01T00:00:00.000Z')],
      })
      .mockResolvedValueOnce({ createDocumentDraft: { id: 'new-1' } });

    const { result } = await renderHook(() => useCreateOrOpenDraft('app-1', 'cover_letter'), {
      wrapper,
    });
    await act(async () => result.current.run());

    expect(mockedGql).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({
          applicationId: 'app-1',
          type: 'cover_letter',
          title: 'Cover Letter',
          plainText: '',
          sourceDocumentId: null,
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith('./documents/new-1');
  });

  it('reports the API message when creating fails', async () => {
    mockedGql.mockResolvedValueOnce({ documentDrafts: [] }).mockRejectedValueOnce({
      response: { errors: [{ message: 'Draft limit reached', extensions: { code: 'QUOTA' } }] },
    });

    const { result } = await renderHook(() => useCreateOrOpenDraft('app-1', 'resume'), { wrapper });
    await act(async () => result.current.run());

    expect(result.current.error).toBe('Draft limit reached');
    expect(result.current.pending).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first runs', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockedGql.mockReturnValueOnce(new Promise((r) => (release = r)) as never);

    const { result } = await renderHook(() => useCreateOrOpenDraft('app-1', 'resume'), { wrapper });
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.run();
      void result.current.run();
    });
    expect(mockedGql).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ documentDrafts: [summary('b', 'resume', '', '2026-01-01T00:00:00.000Z')] });
      await first;
    });
    expect(push).toHaveBeenCalledTimes(1);
  });
});
