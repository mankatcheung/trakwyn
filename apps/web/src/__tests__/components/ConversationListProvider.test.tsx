import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockHostedAi } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockHostedAi: vi.fn((): boolean | null => true),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
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

vi.mock('#/lib/aiCredits', async () => {
  const actual = await vi.importActual<typeof import('#/lib/aiCredits')>('#/lib/aiCredits');
  return { ...actual, useHostedAiAvailable: mockHostedAi };
});

import { ChatDockProvider } from '#/lib/chatDock';
import { ChatDockConversationPicker } from '#/routes/_authenticated/-chat-dock-picker';
import { ConversationHistoryPage } from '#/routes/_authenticated/assistant/-components/ConversationHistoryPage';

function documentOf(arg: unknown): string {
  return typeof arg === 'string' ? arg : (arg as { document: string }).document;
}

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>
      <ChatDockProvider>{children}</ChatDockProvider>
    </QueryClientProvider>
  );
}

const conversations = [
  {
    id: 'conv-1',
    title: 'Locked to a key',
    llmProvider: 'openai',
    llmModel: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    title: 'Never named a key',
    llmProvider: null,
    llmModel: null,
    updatedAt: new Date().toISOString(),
  },
];

function setup(aiSource: string) {
  mockGqlRequest.mockImplementation((arg: unknown) => {
    const query = documentOf(arg);
    if (query.includes('LlmApiKeys'))
      return Promise.resolve({
        llmApiKeys: [{ provider: 'openai' }],
        me: { defaultLlmProvider: 'openai', aiSource },
      });
    return Promise.resolve({ conversations });
  });
}

/** The "time ago · provider" line under a conversation title. */
function metaOf(title: string): string {
  return screen.getByText(title).parentElement?.querySelector('p:last-child')?.textContent ?? '';
}

const surfaces = [
  ['the history page', () => <ConversationHistoryPage />],
  ['the dock picker', () => <ChatDockConversationPicker onSelect={() => {}} />],
] as const;

describe.each(surfaces)('conversation rows on %s (JEF-503)', (_name, renderSurface) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHostedAi.mockReturnValue(true);
  });

  it.each(['auto', 'own'])('names the stored provider under the %s source', async (aiSource) => {
    setup(aiSource);
    render(renderSurface(), { wrapper: Wrapper });

    await waitFor(() => expect(metaOf('Locked to a key')).toContain('· OpenAI'));
    expect(metaOf('Never named a key')).not.toContain('·');
  });

  it('says Trakwyn AI on every row under the Trakwyn AI source, not the stored provider', async () => {
    setup('trakwyn');
    render(renderSurface(), { wrapper: Wrapper });

    await waitFor(() => expect(metaOf('Locked to a key')).toContain('· Trakwyn AI'));
    expect(metaOf('Locked to a key')).not.toContain('OpenAI');
    expect(metaOf('Never named a key')).toContain('· Trakwyn AI');
  });

  it('does not flash the stored provider while a Trakwyn AI user’s plan is loading', async () => {
    mockHostedAi.mockReturnValue(null);
    setup('trakwyn');
    render(renderSurface(), { wrapper: Wrapper });

    await screen.findByText('Locked to a key');
    await waitFor(() => expect(mockGqlRequest.mock.results.length).toBeGreaterThanOrEqual(2));
    await Promise.all(mockGqlRequest.mock.results.map((r) => r.value));
    expect(metaOf('Locked to a key')).not.toContain('OpenAI');
  });
});
