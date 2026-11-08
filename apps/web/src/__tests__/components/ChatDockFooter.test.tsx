import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ChatDockProvider } from '#/lib/chatDock';
import { ChatDockFooter } from '#/routes/_authenticated/-chat-dock-footer';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>
      <ChatDockProvider>{children}</ChatDockProvider>
    </QueryClientProvider>
  );
}

describe('ChatDockFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({
      conversations: [
        {
          id: 'conv-1',
          title: 'Ghosted applications',
          llmProvider: 'anthropic',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('renders the launcher button and no pills initially', () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    expect(screen.getByLabelText('Chat with Assistant')).toBeInTheDocument();
    expect(screen.queryByLabelText('Close conversation')).not.toBeInTheDocument();
  });

  it('fetches nothing until a pill needs a title (JEF-535)', async () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('opens the picker on click, showing New conversation and recent conversations', async () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText('Chat with Assistant'));

    expect(screen.getByText('New conversation')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());
  });

  it('selecting a recent conversation closes the picker and pins a pill', async () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText('Chat with Assistant'));
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Ghosted applications'));

    expect(screen.queryByText('New conversation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Close conversation')).toBeInTheDocument();
  });

  it('picking "New conversation" closes the picker without pinning a pill', async () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText('Chat with Assistant'));
    await waitFor(() => expect(screen.getByText('New conversation')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New conversation'));

    expect(screen.queryByText('New conversation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close conversation')).not.toBeInTheDocument();
  });

  it('closing a pill via its × button removes it from the rail', async () => {
    render(<ChatDockFooter />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText('Chat with Assistant'));
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ghosted applications'));
    expect(screen.getByLabelText('Close conversation')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close conversation'));

    expect(screen.queryByLabelText('Close conversation')).not.toBeInTheDocument();
  });
});
