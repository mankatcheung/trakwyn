import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockStreamChatMessage, mockSearch, mockHostedAi } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockStreamChatMessage: vi.fn(),
  mockSearch: vi.fn(() => ({}) as { conversation?: string }),
  mockHostedAi: vi.fn((): boolean | null => true),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useSearch: mockSearch,
    fullPath: '/assistant/',
  }),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    search: _search,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/chatStream', async () => {
  const actual = await vi.importActual<typeof import('#/lib/chatStream')>('#/lib/chatStream');
  return { ...actual, streamChatMessage: mockStreamChatMessage };
});

vi.mock('#/lib/aiCredits', async () => {
  const actual = await vi.importActual<typeof import('#/lib/aiCredits')>('#/lib/aiCredits');
  return { ...actual, useHostedAiAvailable: mockHostedAi };
});

vi.mock('#/components/AiCreditsMeter', () => ({ AiCreditsMeter: () => null }));

import { AssistantPage } from '#/routes/_authenticated/assistant/-components/AssistantPage';

function documentOf(arg: unknown): string {
  return typeof arg === 'string' ? arg : (arg as { document: string }).document;
}

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

interface Setup {
  /** The providers AI calls try, first to last (JEF-503). */
  order?: string[];
  keys?: Array<{ provider: string }>;
  conversations?: Array<Record<string, unknown>>;
}

function setup({
  order = ['openai'],
  keys = [{ provider: 'openai' }],
  conversations = [],
}: Setup = {}) {
  mockGqlRequest.mockImplementation((arg: unknown) => {
    const query = documentOf(arg);
    if (query.includes('LlmApiKeys'))
      return Promise.resolve({ llmApiKeys: keys, me: { aiProviderOrder: order } });
    if (query.includes('CreateConversation'))
      return Promise.resolve({
        createConversation: { id: 'new-conv', title: null, createdAt: '', updatedAt: '' },
      });
    if (query.includes('ChatHistory')) return Promise.resolve({ chatHistory: [] });
    if (query.includes('Conversations')) return Promise.resolve({ conversations });
    return Promise.resolve({});
  });
}

/** Resolves once the AI settings request has been answered and React has rendered the result. */
async function settingsRendered(): Promise<void> {
  await waitFor(() =>
    expect(mockGqlRequest.mock.calls.some((c) => documentOf(c[0]).includes('LlmApiKeys'))).toBe(
      true,
    ),
  );
  const index = mockGqlRequest.mock.calls.findIndex((c) => documentOf(c[0]).includes('LlmApiKeys'));
  await mockGqlRequest.mock.results[index]?.value;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The variables the page sent when it created a conversation, or `undefined` if it never did. */
function createConversationCall() {
  return mockGqlRequest.mock.calls.find((c) => documentOf(c[0]).includes('CreateConversation'));
}

describe('AssistantPage: which AI answers (JEF-503)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockReturnValue({});
    mockHostedAi.mockReturnValue(true);
    mockStreamChatMessage.mockResolvedValue(undefined);
  });

  describe.each([
    ['Trakwyn AI alone', ['trakwyn']],
    ['one own key', ['openai']],
    ['a key then Trakwyn AI', ['openai', 'trakwyn']],
  ])('a new chat with %s listed', (_name, order) => {
    it('has no provider or model picker', async () => {
      setup({ order });
      render(<AssistantPage />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(
          screen.getByText('Ask about your applications, contacts, or interview rounds.'),
        ).toBeInTheDocument(),
      );
      // The picker used to appear only once the user's keys had loaded, so wait
      // for that response and a render after it before asserting it is absent.
      await settingsRendered();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Model (optional)')).not.toBeInTheDocument();
    });
  });

  it('says Trakwyn AI answers, with a way to use a key, when it leads the order', async () => {
    setup({ order: ['trakwyn', 'openai'] });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Answers come from Trakwyn AI\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use your own key' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('names the key that leads the order, and links to settings to change it', async () => {
    setup({
      order: ['anthropic', 'openai'],
      keys: [{ provider: 'openai' }, { provider: 'anthropic' }],
    });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Using Anthropic \(Claude\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change in settings' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('creates the conversation with no provider, whichever AI leads the order', async () => {
    setup({
      order: ['anthropic', 'openai'],
      keys: [{ provider: 'openai' }, { provider: 'anthropic' }],
    });
    render(<AssistantPage />, { wrapper: Wrapper });
    await screen.findByText(/Using Anthropic/);

    fireEvent.click(screen.getByText('Summarize my interviews this month'));

    await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
    expect(createConversationCall()?.[1]).toBeUndefined();
  });

  describe('an existing conversation that was started on an OpenAI key', () => {
    const conversations = [
      { id: 'conv-1', title: 'Prep', llmProvider: 'openai', llmModel: 'gpt-4o' },
    ];

    beforeEach(() => {
      mockSearch.mockReturnValue({ conversation: 'conv-1' });
    });

    it('says Trakwyn AI when it leads the order, not the stored key', async () => {
      setup({ order: ['trakwyn', 'openai'], conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using Trakwyn AI')).toBeInTheDocument();
      expect(screen.queryByText(/OpenAI/)).not.toBeInTheDocument();
      expect(screen.queryByText(/gpt-4o/)).not.toBeInTheDocument();
    });

    it('names the key that leads now, not the one the chat started on, with no stale model', async () => {
      setup({ order: ['anthropic', 'openai'], conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using Anthropic (Claude)')).toBeInTheDocument();
      expect(screen.queryByText(/gpt-4o/)).not.toBeInTheDocument();
    });

    it('keeps the model while the key it was started on still leads', async () => {
      setup({ order: ['openai'], conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using OpenAI (gpt-4o)')).toBeInTheDocument();
    });

    it('names the key behind Trakwyn AI when the plan has none', async () => {
      mockHostedAi.mockReturnValue(false);
      setup({ order: ['trakwyn', 'openai'], conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using OpenAI (gpt-4o)')).toBeInTheDocument();
    });

    it('shows nothing until it knows, when Trakwyn AI leads and the plan is still loading', async () => {
      mockHostedAi.mockReturnValue(null);
      setup({ order: ['trakwyn', 'openai'], conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      await screen.findByText('Prep');
      await settingsRendered();
      expect(screen.queryByText(/^Using/)).not.toBeInTheDocument();
    });
  });

  it('asks for a key when nothing is listed and Trakwyn AI is not on the plan', async () => {
    mockHostedAi.mockReturnValue(false);
    setup({ order: [], keys: [] });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
