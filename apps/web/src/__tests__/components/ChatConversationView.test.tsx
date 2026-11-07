import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockStreamChatMessage, mockRefreshAiCredits, aiCredits } = vi.hoisted(
  () => ({
    mockGqlRequest: vi.fn(),
    mockStreamChatMessage: vi.fn(),
    mockRefreshAiCredits: vi.fn(),
    aiCredits: { onTrakwynAi: false },
  }),
);

vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({ onTrakwynAi: aiCredits.onTrakwynAi, refresh: mockRefreshAiCredits }),
}));
vi.mock('#/components/AiCreditsMeter', () => ({
  AiCreditsMeter: ({ variant }: { variant?: string }) => (
    <p data-testid="chat-credits" data-variant={variant} />
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/chatStream', async () => {
  const actual = await vi.importActual<typeof import('#/lib/chatStream')>('#/lib/chatStream');
  return { ...actual, streamChatMessage: mockStreamChatMessage };
});

import { ChatConversationView } from '#/routes/_authenticated/assistant/-components/ChatConversationView';
import { ChatStreamError } from '#/lib/chatStream';

/**
 * `gqlClient.request` is called positionally (query, variables) for most
 * mutations, but the send mutation switched to the object form
 * ({ document, variables, signal }) so a cancel signal can be attached
 * (JEF-240) — this normalizes both call shapes down to the query string so
 * mock implementations don't need to care which one fired.
 */
function documentOf(arg: unknown): string {
  return typeof arg === 'string' ? arg : (arg as { document: string }).document;
}

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

describe('ChatConversationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiCredits.onTrakwynAi = false;
    mockRefreshAiCredits.mockResolvedValue(undefined);
  });

  describe('AI credits meter (JEF-511)', () => {
    const sendHello = () => {
      fireEvent.change(screen.getByPlaceholderText('Ask a question…'), {
        target: { value: 'hello' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    };

    it('shows the inline credits line by the composer for a user on Trakwyn AI', async () => {
      aiCredits.onTrakwynAi = true;
      mockGqlRequest.mockResolvedValue({ chatHistory: [] });

      render(<ChatConversationView conversationId="c1" onConversationCreated={vi.fn()} />, {
        wrapper: Wrapper,
      });

      expect(await screen.findByTestId('chat-credits')).toHaveAttribute('data-variant', 'inline');
    });

    it('shows nothing for a user on their own key', async () => {
      mockGqlRequest.mockResolvedValue({ chatHistory: [] });

      render(<ChatConversationView conversationId="c1" onConversationCreated={vi.fn()} />, {
        wrapper: Wrapper,
      });

      await screen.findByPlaceholderText('Ask a question…');
      expect(screen.queryByTestId('chat-credits')).not.toBeInTheDocument();
    });

    it('re-reads the credits after a turn is sent', async () => {
      aiCredits.onTrakwynAi = true;
      mockGqlRequest.mockResolvedValue({ chatHistory: [] });
      mockStreamChatMessage.mockResolvedValue(undefined);

      render(<ChatConversationView conversationId="c1" onConversationCreated={vi.fn()} />, {
        wrapper: Wrapper,
      });
      sendHello();

      await waitFor(() => expect(mockRefreshAiCredits).toHaveBeenCalledTimes(1));
    });

    it('re-reads the credits when the turn fails too', async () => {
      aiCredits.onTrakwynAi = true;
      mockGqlRequest.mockResolvedValue({ chatHistory: [] });
      mockStreamChatMessage.mockRejectedValue(new Error('boom'));

      render(<ChatConversationView conversationId="c1" onConversationCreated={vi.fn()} />, {
        wrapper: Wrapper,
      });
      sendHello();

      await waitFor(() => expect(mockRefreshAiCredits).toHaveBeenCalledTimes(1));
    });
  });

  it('shows proposal cards under the assistant reply: live while pending, resolved otherwise (JEF-469)', async () => {
    const proposal = (id: string, status: string, summary: string) => ({
      id,
      toolName: 'update_application',
      summary,
      status,
      error: null,
    });
    mockGqlRequest.mockImplementation((arg: unknown) => {
      if (documentOf(arg).includes('ChatHistory'))
        return Promise.resolve({
          chatHistory: [
            { id: 'm1', role: 'user', content: 'move them', createdAt: '', proposals: [] },
            {
              id: 'm2',
              role: 'assistant',
              content: 'I have proposed two changes.',
              createdAt: '',
              proposals: [
                proposal('p1', 'pending', 'Move Acme to interviewing'),
                proposal('p2', 'confirmed', 'Move Globex to applied'),
              ],
            },
          ],
        });
      return Promise.resolve({});
    });

    render(<ChatConversationView conversationId="c1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(screen.getByText('Move Acme to interviewing')).toBeInTheDocument());
    expect(screen.getAllByTestId('chat-proposal')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows the empty state and no suggested questions when none are given', async () => {
    render(<ChatConversationView conversationId={null} onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(
        screen.getByText('Ask about your applications, contacts, or interview rounds.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /summarize/i })).not.toBeInTheDocument();
  });

  it('streams the reply chip-by-chip and lazily creates a conversation on click', async () => {
    // conversationId is a controlled prop — a real caller (AssistantPage's
    // routing, or the dock's own state) re-renders with the new id once
    // onConversationCreated fires, which is what makes the reply visible.
    // This test asserts what the component itself is responsible for: the
    // create + stream calls firing with the right arguments, the streamed
    // text rendering live, and the callback firing with the new id.
    mockGqlRequest.mockImplementation((arg: unknown) => {
      const query = documentOf(arg);
      if (query.includes('CreateConversation'))
        return Promise.resolve({
          createConversation: { id: 'new-conv', title: null, createdAt: '', updatedAt: '' },
        });
      if (query.includes('ChatHistory'))
        return Promise.resolve({
          chatHistory: [
            { id: 'm1', role: 'user', content: 'What are my active applications?', createdAt: '' },
            { id: 'm2', role: 'assistant', content: 'Here you go.', createdAt: '' },
          ],
        });
      return Promise.resolve({});
    });
    let capturedOnDelta: ((text: string) => void) | undefined;
    mockStreamChatMessage.mockImplementation(({ onDelta }: { onDelta: (text: string) => void }) => {
      capturedOnDelta = onDelta;
      return new Promise<void>(() => {});
    });
    const onConversationCreated = vi.fn();

    render(
      <ChatConversationView
        conversationId={null}
        onConversationCreated={onConversationCreated}
        suggestedQuestions={['What are my active applications?']}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() =>
      expect(screen.getByText('What are my active applications?')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('What are my active applications?'));

    await waitFor(() =>
      expect(mockStreamChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'new-conv',
          message: 'What are my active applications?',
          signal: expect.any(AbortSignal),
        }),
      ),
    );
    expect(onConversationCreated).toHaveBeenCalledWith('new-conv');
    // Which AI answers is the user's provider order, so a new chat is created with no provider (JEF-503).
    const createCall = mockGqlRequest.mock.calls.find((c) =>
      documentOf(c[0]).includes('CreateConversation'),
    );
    expect(createCall?.[1]).toBeUndefined();

    capturedOnDelta?.('Here');
    capturedOnDelta?.(' you go.');
    await waitFor(() => expect(screen.getByText('Here you go.')).toBeInTheDocument());
  });

  it('renders existing chat history for an active conversation', async () => {
    mockGqlRequest.mockImplementation((arg: unknown) => {
      const query = documentOf(arg);
      if (query.includes('ChatHistory'))
        return Promise.resolve({
          chatHistory: [
            { id: 'm1', role: 'user', content: 'hi', createdAt: '2024-01-01T00:00:00.000Z' },
            {
              id: 'm2',
              role: 'assistant',
              content: 'hello!',
              createdAt: '2024-01-01T00:00:01.000Z',
            },
          ],
        });
      return Promise.resolve({});
    });

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(screen.getByText('hi')).toBeInTheDocument());
    expect(screen.getByText('hello!')).toBeInTheDocument();
  });

  it('applies compact spacing when compact is true', async () => {
    const { container } = render(
      <ChatConversationView conversationId={null} onConversationCreated={vi.fn()} compact />,
      { wrapper: Wrapper },
    );

    await waitFor(() =>
      expect(
        screen.getByText('Ask about your applications, contacts, or interview rounds.'),
      ).toBeInTheDocument(),
    );
    expect(container.querySelector('.p-3')).not.toBeNull();
  });

  it('replaces the streamed bubble with the persisted history once the stream finishes', async () => {
    let chatHistoryCallCount = 0;
    mockGqlRequest.mockImplementation((arg: unknown) => {
      const query = documentOf(arg);
      if (query.includes('ChatHistory')) {
        chatHistoryCallCount++;
        return Promise.resolve(
          chatHistoryCallCount === 1
            ? { chatHistory: [] }
            : {
                chatHistory: [
                  { id: 'm1', role: 'user', content: 'hi', createdAt: '' },
                  { id: 'm2', role: 'assistant', content: 'Persisted reply.', createdAt: '' },
                ],
              },
        );
      }
      return Promise.resolve({});
    });
    mockStreamChatMessage.mockImplementation(
      async ({ onDelta }: { onDelta: (text: string) => void }) => {
        onDelta('Persisted');
        onDelta(' reply.');
      },
    );

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getAllByText('Persisted reply.')).toHaveLength(1));
  });

  it('shows a Cancel button while sending, and cancelling aborts the request signal without showing an error banner (JEF-240)', async () => {
    mockGqlRequest.mockImplementation(() => Promise.resolve({ chatHistory: [] }));
    let capturedSignal: AbortSignal | undefined;
    let rejectSend: (err: unknown) => void = () => {};
    mockStreamChatMessage.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise((_resolve, reject) => {
        rejectSend = reject;
      });
    });

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(cancelButton);
    expect(capturedSignal?.aborted).toBe(true);
    rejectSend(new DOMException('The operation was aborted.', 'AbortError'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });

  it('shows the generic error banner for a non-cancelled, non-ChatStreamError send failure', async () => {
    mockGqlRequest.mockImplementation(() => Promise.resolve({ chatHistory: [] }));
    mockStreamChatMessage.mockRejectedValue(new Error('boom'));

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument(),
    );
  });

  it('shows the AI-not-configured link for a ChatStreamError with that code', async () => {
    mockGqlRequest.mockImplementation(() => Promise.resolve({ chatHistory: [] }));
    mockStreamChatMessage.mockRejectedValue(
      new ChatStreamError('Add your AI API key', 'AI_NOT_CONFIGURED'),
    );

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText('Account settings')).toBeInTheDocument());
  });

  it("shows the ChatStreamError's own message for any other code", async () => {
    mockGqlRequest.mockImplementation(() => Promise.resolve({ chatHistory: [] }));
    mockStreamChatMessage.mockRejectedValue(
      new ChatStreamError('Too many messages — please wait a moment and try again', 'RATE_LIMITED'),
    );

    render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(
        screen.getByText('Too many messages — please wait a moment and try again'),
      ).toBeInTheDocument(),
    );
  });

  describe('provider fallback (JEF-258, JEF-503)', () => {
    const sendAndStream = (
      impl: (params: {
        onDelta: (text: string) => void;
        onFallback?: (f: { from: string; to: string }) => void;
      }) => Promise<void>,
    ) => {
      mockGqlRequest.mockImplementation(() => Promise.resolve({ chatHistory: [] }));
      mockStreamChatMessage.mockImplementation(impl);

      render(<ChatConversationView conversationId="conv-1" onConversationCreated={vi.fn()} />, {
        wrapper: Wrapper,
      });

      fireEvent.change(screen.getByPlaceholderText('Ask a question…'), { target: { value: 'hi' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    };

    it('says which key answered when one was substituted', async () => {
      sendAndStream(async ({ onDelta, onFallback }) => {
        onFallback?.({ from: 'openai', to: 'anthropic' });
        onDelta('Answer.');
      });

      expect(
        await screen.findByText(/OpenAI could not answer, so Anthropic \(Claude\) did\./),
      ).toBeInTheDocument();
    });

    it('names Trakwyn AI when it is the one that took over, or the one that could not answer', async () => {
      sendAndStream(async ({ onDelta, onFallback }) => {
        onFallback?.({ from: 'trakwyn', to: 'openai' });
        onDelta('Answer.');
      });

      expect(
        await screen.findByText(/Trakwyn AI could not answer, so OpenAI did\./),
      ).toBeInTheDocument();
    });

    it('links the notice to the AI settings page', async () => {
      sendAndStream(async ({ onDelta, onFallback }) => {
        onFallback?.({ from: 'openai', to: 'anthropic' });
        onDelta('Answer.');
      });

      const link = await screen.findByRole('link', { name: 'Manage providers' });
      expect(link).toHaveAttribute('href', '/settings/ai');
    });

    it('shows nothing when no substitution happened', async () => {
      sendAndStream(async ({ onDelta }) => {
        onDelta('Answer.');
      });

      // The streamed text is transient — it clears once the history refetch
      // lands — so the send itself is what marks the turn as done here.
      await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
      expect(screen.queryByText(/could not answer/)).not.toBeInTheDocument();
    });
  });
});
