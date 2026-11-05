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
  aiSource?: string;
  keys?: Array<{ provider: string }>;
  defaultProvider?: string | null;
  conversations?: Array<Record<string, unknown>>;
}

function setup({
  aiSource = 'auto',
  keys = [{ provider: 'openai' }],
  defaultProvider = 'openai',
  conversations = [],
}: Setup = {}) {
  mockGqlRequest.mockImplementation((arg: unknown) => {
    const query = documentOf(arg);
    if (query.includes('LlmApiKeys'))
      return Promise.resolve({
        llmApiKeys: keys,
        me: { defaultLlmProvider: defaultProvider, aiSource },
      });
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
function createConversationVariables(): Record<string, unknown> | undefined {
  const call = mockGqlRequest.mock.calls.find((c) =>
    documentOf(c[0]).includes('CreateConversation'),
  );
  return call?.[1] as Record<string, unknown> | undefined;
}

describe('AssistantPage — which AI answers (JEF-503)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockReturnValue({});
    mockHostedAi.mockReturnValue(true);
    mockStreamChatMessage.mockResolvedValue(undefined);
  });

  describe.each(['auto', 'own', 'trakwyn'])('a new chat with the source set to %s', (aiSource) => {
    it('has no provider or model picker', async () => {
      setup({ aiSource });
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

  it('says Trakwyn AI answers, with a way to use a key, under the Trakwyn AI source', async () => {
    setup({ aiSource: 'trakwyn' });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Answers come from Trakwyn AI\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use your own key' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('names the key a new chat will use, and links to settings, under own key', async () => {
    setup({ aiSource: 'own' });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Using OpenAI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change in settings' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('sends no provider when a chat is created under the Trakwyn AI source', async () => {
    setup({ aiSource: 'trakwyn' });
    render(<AssistantPage />, { wrapper: Wrapper });
    await screen.findByText(/Answers come from Trakwyn AI\./);

    fireEvent.click(screen.getByText('Summarize my interviews this month'));

    await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
    expect(createConversationVariables()).toEqual({ provider: null });
  });

  it("creates the chat with the user's default key under own key", async () => {
    setup({
      aiSource: 'own',
      keys: [{ provider: 'anthropic' }, { provider: 'openai' }],
      defaultProvider: 'openai',
    });
    render(<AssistantPage />, { wrapper: Wrapper });
    await screen.findByText(/Using OpenAI/);

    fireEvent.click(screen.getByText('Summarize my interviews this month'));

    await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
    expect(createConversationVariables()).toEqual({ provider: 'openai' });
  });

  it('falls back to the first key when the default key was deleted', async () => {
    setup({ aiSource: 'auto', keys: [{ provider: 'anthropic' }], defaultProvider: null });
    render(<AssistantPage />, { wrapper: Wrapper });
    await screen.findByText(/Using Anthropic/);

    fireEvent.click(screen.getByText('Summarize my interviews this month'));

    await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
    expect(createConversationVariables()).toEqual({ provider: 'anthropic' });
  });

  describe('an existing conversation locked to an own key', () => {
    const conversations = [
      { id: 'conv-1', title: 'Prep', llmProvider: 'openai', llmModel: 'gpt-4o' },
    ];

    beforeEach(() => {
      mockSearch.mockReturnValue({ conversation: 'conv-1' });
    });

    it('says Trakwyn AI under the Trakwyn AI source, not the stored provider', async () => {
      setup({ aiSource: 'trakwyn', conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using Trakwyn AI')).toBeInTheDocument();
      expect(screen.queryByText(/OpenAI/)).not.toBeInTheDocument();
      expect(screen.queryByText(/gpt-4o/)).not.toBeInTheDocument();
    });

    it.each(['auto', 'own'])(
      'still names the key and model under the %s source',
      async (aiSource) => {
        setup({ aiSource, conversations });
        render(<AssistantPage />, { wrapper: Wrapper });

        expect(await screen.findByText('Using OpenAI (gpt-4o)')).toBeInTheDocument();
      },
    );

    it('shows the stored provider when Trakwyn AI is not available on the plan', async () => {
      mockHostedAi.mockReturnValue(false);
      setup({ aiSource: 'trakwyn', conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      expect(await screen.findByText('Using OpenAI (gpt-4o)')).toBeInTheDocument();
    });

    it('shows nothing until it knows, for a Trakwyn AI user whose plan is still loading', async () => {
      mockHostedAi.mockReturnValue(null);
      setup({ aiSource: 'trakwyn', conversations });
      render(<AssistantPage />, { wrapper: Wrapper });

      await screen.findByText('Prep');
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      expect(screen.queryByText(/^Using/)).not.toBeInTheDocument();
    });
  });

  it('asks for a key when there is none and Trakwyn AI is not available', async () => {
    mockHostedAi.mockReturnValue(false);
    setup({ aiSource: 'auto', keys: [], defaultProvider: null });
    render(<AssistantPage />, { wrapper: Wrapper });

    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
