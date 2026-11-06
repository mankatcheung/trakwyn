import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useGenerateIntoDocumentDraft, usePolishDocumentDraft } from '../useDocumentDraftAi';

const mockedGql = jest.mocked(gqlRequest);

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('draft AI mutations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('polish sends the live text and prompt and returns the markdown', async () => {
    mockedGql.mockResolvedValueOnce({ polishDocumentDraft: { markdown: '# Better' } });
    const { result } = await renderHook(() => usePolishDocumentDraft(), { wrapper });

    let markdown = '';
    await act(async () => {
      markdown = await result.current.mutateAsync({
        draftId: 'd1',
        plainText: 'draft',
        instructions: 'concise',
      });
    });

    expect(markdown).toBe('# Better');
    expect(mockedGql).toHaveBeenCalledWith(expect.stringContaining('polishDocumentDraft'), {
      draftId: 'd1',
      plainText: 'draft',
      instructions: 'concise',
    });
  });

  it('generate passes the prompt and resume choice and returns the content', async () => {
    mockedGql.mockResolvedValueOnce({
      generateIntoDocumentDraft: { contentJson: '{}', plainText: 'Dear' },
    });
    const { result } = await renderHook(() => useGenerateIntoDocumentDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        draftId: 'd1',
        instructions: 'warm',
        resumeDraftId: 'r1',
      });
    });

    expect(mockedGql).toHaveBeenCalledWith(expect.stringContaining('generateIntoDocumentDraft'), {
      draftId: 'd1',
      instructions: 'warm',
      resumeDocumentId: null,
      resumeDraftId: 'r1',
    });
  });
});
