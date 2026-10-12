import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

// The screen's focus callback, captured so a test can fire it the way
// expo-router does when a sub-screen is popped.
let focusCallback: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallback = callback;
  },
}));

import { gqlRequest } from '../../../../graphql/client';
import { useSectionCounts } from '../useSectionCounts';

const mockedGqlRequest = jest.mocked(gqlRequest);

const apiCounts = { notes: 3, interviews: 0, contacts: 1, offers: 2, companyBriefing: true };

function respond(overrides: { documents?: unknown[]; drafts?: unknown[]; counts?: object } = {}) {
  mockedGqlRequest.mockImplementation((query: string) => {
    if (query.includes('ApplicationSectionCounts')) {
      return Promise.resolve({
        application: { id: '1', sectionCounts: overrides.counts ?? apiCounts },
      });
    }
    if (query.includes('DocumentDrafts')) {
      return Promise.resolve({ documentDrafts: overrides.drafts ?? [] });
    }
    return Promise.resolve({ documents: overrides.documents ?? [] });
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const countsCalls = () =>
  mockedGqlRequest.mock.calls.filter(([q]) => String(q).includes('ApplicationSectionCounts'))
    .length;

describe('useSectionCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = undefined;
  });

  it('combines the API counts with the per-category document counts', async () => {
    respond({
      documents: [{ documentType: 'resume' }, { documentType: 'portfolio' }],
      drafts: [{ type: 'cover_letter' }, { type: 'resume' }],
    });

    const { result } = await renderHook(() => useSectionCounts('1'), { wrapper });

    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      ...apiCounts,
      coverLetters: 1,
      resumes: 2,
      otherDocuments: 1,
    });
  });

  it('passes the application id to the counts query', async () => {
    respond();

    const { result } = await renderHook(() => useSectionCounts('1'), { wrapper });

    await waitFor(() => expect(result.current).toBeDefined());
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('ApplicationSectionCounts'),
      { id: '1' },
    );
  });

  it('stays undefined while any of the three queries is still loading', async () => {
    mockedGqlRequest.mockImplementation((query: string) =>
      String(query).includes('ApplicationSectionCounts')
        ? new Promise(() => undefined)
        : Promise.resolve({ documents: [], documentDrafts: [] }),
    );

    const { result } = await renderHook(() => useSectionCounts('1'), { wrapper });

    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalledTimes(3));
    expect(result.current).toBeUndefined();
  });

  it('does not fetch without an application id', async () => {
    const { result } = await renderHook(() => useSectionCounts(''), { wrapper });

    expect(result.current).toBeUndefined();
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('refetches when the screen regains focus, so a badge cannot go stale', async () => {
    respond();
    const { result } = await renderHook(() => useSectionCounts('1'), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(countsCalls()).toBe(1);

    respond({ counts: { ...apiCounts, notes: 4 } });
    await act(async () => {
      focusCallback?.();
    });

    await waitFor(() => expect(result.current?.notes).toBe(4));
    expect(countsCalls()).toBe(2);
  });
});
