import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockRequest, mockNavigate } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mockNavigate }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));

import {
  findBlankDraft,
  useCreateOrOpenDraft,
} from '#/routes/_authenticated/applications/$applicationId/-components/useCreateOrOpenDraft';

const draft = (id: string, type: string, plainText: string | undefined, updatedAt: string) => ({
  id,
  applicationId: 'app-1',
  type,
  title: id,
  plainText,
  createdAt: updatedAt,
  updatedAt,
});

function setup(type: 'resume' | 'cover_letter' = 'resume') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useCreateOrOpenDraft('app-1', type), { wrapper }), invalidate };
}

function api(
  drafts: ReturnType<typeof draft>[],
  create: () => Promise<unknown> = () =>
    Promise.resolve({ createDocumentDraft: { id: 'created', applicationId: 'app-1' } }),
) {
  mockRequest.mockImplementation((query: string) =>
    query.includes('CreateDocumentDraft') ? create() : Promise.resolve({ documentDrafts: drafts }),
  );
}

const creates = () =>
  mockRequest.mock.calls.filter(([q]) => String(q).includes('CreateDocumentDraft'));
const draftsPath = (draftId: string) => ({
  to: '/applications/$applicationId/documents/$draftId',
  params: { applicationId: 'app-1', draftId },
});

describe('findBlankDraft', () => {
  it('picks the most recently updated blank draft of the type', () => {
    const drafts = [
      draft('old', 'resume', '', '2026-01-01T00:00:00Z'),
      draft('new', 'resume', '  \n ', '2026-02-01T00:00:00Z'),
      draft('letter', 'cover_letter', '', '2026-03-01T00:00:00Z'),
      draft('filled', 'resume', 'text', '2026-04-01T00:00:00Z'),
    ];
    expect(findBlankDraft(drafts, 'resume')?.id).toBe('new');
  });

  it('does not treat a draft whose text is unknown as blank', () => {
    expect(
      findBlankDraft([draft('x', 'resume', undefined, '2026-01-01T00:00:00Z')], 'resume'),
    ).toBe(undefined);
  });
});

describe('useCreateOrOpenDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the existing blank draft without creating another', async () => {
    api([draft('blank-1', 'resume', '', '2026-01-01T00:00:00Z')]);
    const { result } = setup();

    await act(() => result.current.run());

    expect(mockNavigate).toHaveBeenCalledWith(draftsPath('blank-1'));
    expect(creates()).toHaveLength(0);
  });

  it('reads the list fresh each time', async () => {
    api([]);
    const { result } = setup();
    await act(() => result.current.run());
    await act(() => result.current.run());

    const lists = mockRequest.mock.calls.filter(([q]) =>
      String(q).includes('query DocumentDrafts'),
    );
    expect(lists).toHaveLength(2);
  });

  it('creates a blank draft named after the type when none is blank, and opens it', async () => {
    api([draft('filled', 'resume', 'words', '2026-01-01T00:00:00Z')]);
    const { result, invalidate } = setup('cover_letter');

    await act(() => result.current.run());

    expect(creates()[0]![1]).toEqual({
      input: {
        applicationId: 'app-1',
        type: 'cover_letter',
        title: 'Cover Letter',
        contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        plainText: '',
        sourceDocumentId: null,
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith(draftsPath('created'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documentDrafts', 'app-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sectionCounts', 'app-1'] });
  });

  it('ignores a blank draft of the other type', async () => {
    api([draft('letter', 'cover_letter', '', '2026-01-01T00:00:00Z')]);
    const { result } = setup('resume');
    await act(() => result.current.run());
    expect(creates()).toHaveLength(1);
  });

  it("shows the API's message when creating fails, and does not navigate", async () => {
    api([], () =>
      Promise.reject({
        response: {
          errors: [{ message: 'Draft limit reached', extensions: { code: 'QUOTA_EXCEEDED' } }],
        },
      }),
    );
    const { result } = setup();

    await act(() => result.current.run());

    expect(result.current.error).toMatch(/draft limit reached/i);
    expect(result.current.pending).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears the error on the next attempt', async () => {
    api([], () => Promise.reject(new Error('down')));
    const { result } = setup();
    await act(() => result.current.run());
    expect(result.current.error).not.toBeNull();

    api([draft('blank-1', 'resume', '', '2026-01-01T00:00:00Z')]);
    await act(() => result.current.run());
    expect(result.current.error).toBeNull();
  });

  it('is pending while running, and a second click creates nothing more', async () => {
    let finish: (v: unknown) => void = () => {};
    api([], () => new Promise((resolve) => (finish = resolve)));
    const { result } = setup();

    act(() => {
      void result.current.run();
      void result.current.run();
    });
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(result.current.pending).toBe(true);
    await act(async () => {
      void result.current.run();
    });
    expect(creates()).toHaveLength(1);

    await act(async () => {
      finish({ createDocumentDraft: { id: 'created', applicationId: 'app-1' } });
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
