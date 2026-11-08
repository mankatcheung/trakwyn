import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate, mockDock } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
  mockDock: {
    sections: [] as string[],
    expanded: null as string | 'new' | null,
    openNew: vi.fn(),
    openConversation: vi.fn(),
    minimize: vi.fn(),
    closeExpanded: vi.fn(),
    closeSection: vi.fn(),
    promoteNewConversation: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/chatDock', () => ({
  useChatDock: () => mockDock,
}));

import { ChatDockFloatingWindow } from '#/routes/_authenticated/-chat-dock-floating-window';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

describe('ChatDockFloatingWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDock.sections = [];
    mockDock.expanded = null;
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('LlmApiKeys'))
        return Promise.resolve({
          llmApiKeys: [{ provider: 'anthropic' }],
          me: { defaultLlmProvider: 'anthropic' },
        });
      if (query.includes('Conversations'))
        return Promise.resolve({
          conversations: [
            { id: 'conv-1', title: 'Ghosted applications', updatedAt: '2024-01-01T00:00:00.000Z' },
          ],
        });
      return Promise.resolve({ chatHistory: [] });
    });
  });

  it('renders nothing when nothing is expanded', () => {
    const { container } = render(<ChatDockFloatingWindow />, { wrapper: Wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches nothing while closed: no conversations, API keys or billing (JEF-535)', async () => {
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('shows "New conversation" with maximize disabled for a not-yet-created draft', async () => {
    mockDock.expanded = 'new';
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('New conversation')).toBeInTheDocument());
    expect(screen.getByLabelText('Maximize')).toBeDisabled();
  });

  it('shows the real conversation title when an existing conversation is expanded', async () => {
    mockDock.expanded = 'conv-1';
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());
    expect(screen.getByLabelText('Maximize')).not.toBeDisabled();
  });

  it('clicking minimize calls dock.minimize', async () => {
    mockDock.expanded = 'conv-1';
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Minimize'));

    expect(mockDock.minimize).toHaveBeenCalledOnce();
  });

  it('clicking close calls dock.closeExpanded', async () => {
    mockDock.expanded = 'conv-1';
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Close'));

    expect(mockDock.closeExpanded).toHaveBeenCalledOnce();
  });

  it('clicking maximize navigates to the full assistant page and closes the dock section', async () => {
    mockDock.expanded = 'conv-1';
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Ghosted applications')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Maximize'));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/assistant',
      search: { conversation: 'conv-1' },
    });
    expect(mockDock.closeExpanded).toHaveBeenCalledOnce();
  });

  it('shows the chat view without a key, since Trakwyn AI answers (JEF-451)', async () => {
    mockDock.expanded = 'new';
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('LlmApiKeys'))
        return Promise.resolve({ llmApiKeys: [], me: { defaultLlmProvider: null } });
      return Promise.resolve({ conversations: [] });
    });
    render(<ChatDockFloatingWindow />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByPlaceholderText('Ask a question…')).toBeInTheDocument());
    expect(screen.queryByText(/Add an AI API key/)).not.toBeInTheDocument();
  });
});
