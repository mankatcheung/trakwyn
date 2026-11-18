import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRecent, mockHistory } = vi.hoisted(() => ({
  mockRecent: vi.fn(),
  mockHistory: vi.fn(),
}));

vi.mock('#/features/chat/graphql/chatQueries', () => ({
  recentConversationsQueryOptions: mockRecent,
  chatHistoryQueryOptions: mockHistory,
}));
vi.mock('../../features/chat/pages/AssistantPage', () => ({ AssistantPage: () => null }));

type Options = {
  validateSearch: { parse: (input: unknown) => { conversation?: string } };
  loaderDeps: (opts: { search: { conversation?: string } }) => { conversation?: string };
  loader: (opts: {
    context: { queryClient: { query: (o: unknown) => Promise<void> } };
    deps: { conversation?: string };
  }) => Promise<void>;
};

async function loadOptions(): Promise<Options> {
  const mod = await import('#/routes/_authenticated/assistant/index');
  return (mod.Route as unknown as { options: Options }).options;
}

describe('/assistant route (JEF-229)', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue(undefined);
    mockRecent.mockReturnValue({ queryKey: ['recent'] });
    mockHistory.mockImplementation((id: string) => ({ queryKey: ['history', id] }));
  });

  it('accepts an optional conversation and rejects a non-string one', async () => {
    const { validateSearch } = await loadOptions();

    expect(validateSearch.parse({})).toEqual({});
    expect(validateSearch.parse({ conversation: 'c1' })).toEqual({ conversation: 'c1' });
    expect(() => validateSearch.parse({ conversation: 5 })).toThrow();
  });

  it('re-runs the loader when the conversation changes', async () => {
    const { loaderDeps } = await loadOptions();

    expect(loaderDeps({ search: { conversation: 'c1' } })).toEqual({ conversation: 'c1' });
  });

  it('loads only the recent conversations without a conversation', async () => {
    const { loader } = await loadOptions();

    await loader({ context: { queryClient: { query } }, deps: {} });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ queryKey: ['recent'], staleTime: 'static' });
    expect(mockHistory).not.toHaveBeenCalled();
  });

  it('also loads the chat history when a conversation is set', async () => {
    const { loader } = await loadOptions();

    await loader({ context: { queryClient: { query } }, deps: { conversation: 'c1' } });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith({ queryKey: ['recent'], staleTime: 'static' });
    expect(query).toHaveBeenCalledWith({ queryKey: ['history', 'c1'], staleTime: 'static' });
  });
});
