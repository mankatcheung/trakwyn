import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, unknown>;
    onClick?: (event: unknown) => void;
  }) => (
    // The container's own onNavigate must still fire alongside the router
    // spy — the mobile drawer relies on it after a pick.
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        mockNavigate({ to, search });
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import {
  AssistantNavConversations,
  type AssistantNavConversationsProps,
} from '#/features/chat/components/AssistantNavConversations';
import { SIDEBAR_CONVERSATION_LIMIT } from '#/features/chat/graphql/chatQueries';
import { gqlContaining } from '#/__tests__/helpers/gqlText';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const renderNav = (props: AssistantNavConversationsProps = {}) =>
  render(<AssistantNavConversations {...props} />, { wrapper: Wrapper });

const recentConversations = (ids: string[]) => ({
  conversations: ids.map((id) => ({
    id,
    title: `${id} title`,
    llmProvider: null,
    llmModel: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
});

describe('AssistantNavConversations (app-sidebar subitems)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue(recentConversations(['conv-1', 'conv-2']));
  });

  it('fetches only the bounded recent window, not the full history', async () => {
    renderNav();

    await waitFor(() => expect(screen.getByText('conv-2 title')).toBeInTheDocument());
    expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RecentConversations'), {
      limit: SIDEBAR_CONVERSATION_LIMIT,
    });
  });

  it('marks the active conversation and links each row through the search param', async () => {
    renderNav({ activeId: 'conv-1' });

    await waitFor(() => expect(screen.getByText('conv-1 title')).toBeInTheDocument());
    const activeRow = screen.getByText('conv-1 title');
    expect(activeRow).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('conv-2 title')).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByText('conv-2 title'));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/assistant',
      search: { conversation: 'conv-2' },
    });
  });

  it('falls back to "New conversation" for a thread with no title yet', async () => {
    mockGqlRequest.mockResolvedValue({
      conversations: [
        {
          id: 'conv-1',
          title: null,
          llmProvider: null,
          llmModel: null,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    renderNav({ activeId: undefined });

    await waitFor(() => expect(screen.getByText('New conversation')).toBeInTheDocument());
  });

  it('starts a new conversation from a dedicated first subitem', async () => {
    const onNavigate = vi.fn();
    renderNav({ activeId: 'conv-1', onNavigate });

    await waitFor(() => expect(screen.getByText('conv-1 title')).toBeInTheDocument());

    // Sits above the recent threads, and links with an empty search param —
    // clearing ?conversation= is what "new" means.
    const items = screen.getAllByRole('link').map((l) => l.textContent);
    expect(items.indexOf('New conversation')).toBe(0);
    expect(items.indexOf('conv-1 title')).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('New conversation'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/assistant', search: {} });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('always offers the all-chats entry and notifies the container after navigation', async () => {
    const onNavigate = vi.fn();
    mockGqlRequest.mockResolvedValue({ conversations: [] });
    renderNav({ onNavigate });

    const allChats = screen.getByText('All chats');
    expect(allChats).toBeInTheDocument();
    expect(allChats.closest('a')).toHaveAttribute('href', '/assistant/history');

    fireEvent.click(allChats);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
