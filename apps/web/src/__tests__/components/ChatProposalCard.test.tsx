import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockCapture } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('#/lib/analytics')>('#/lib/analytics');
  return { ...actual, captureEvent: mockCapture };
});

import { ChatProposalCard } from '#/routes/_authenticated/assistant/-components/ChatProposalCard';
import type { ChatProposal } from '#/routes/_authenticated/assistant/-shared';

const proposal = (overrides?: Partial<ChatProposal>): ChatProposal => ({
  id: 'p1',
  toolName: 'update_application',
  summary: 'Move Acme / Engineer to interviewing',
  status: 'pending',
  error: null,
  ...overrides,
});

let client: QueryClient;
function renderCard(p: ChatProposal) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatProposalCard proposal={p} conversationId="c1" />
    </QueryClientProvider>,
  );
}

describe('ChatProposalCard (JEF-469)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({});
  });

  it('shows the summary with Confirm and Dismiss while pending', () => {
    renderCard(proposal());

    expect(screen.getByText('Move Acme / Engineer to interviewing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('sends only the id on Confirm, refreshes the app and records the event', async () => {
    renderCard(proposal());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest.mock.calls[0][0]).toContain('confirmChatAction');
    expect(mockGqlRequest.mock.calls[0][1]).toEqual({ id: 'p1' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
    expect(mockCapture).toHaveBeenCalledWith('assistant_change_confirmed', {
      tool: 'update_application',
    });
  });

  it('dismisses without refreshing the rest of the app', async () => {
    renderCard(proposal());
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest.mock.calls[0][0]).toContain('dismissChatAction');
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chatHistory', 'c1'] }),
    );
    expect(mockCapture).toHaveBeenCalledWith('assistant_change_dismissed', {
      tool: 'update_application',
    });
  });

  it('disables both buttons while a request is in flight, so a double click sends once', async () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    renderCard(proposal());

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mockGqlRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['confirmed', 'Done'],
    ['dismissed', 'Dismissed'],
    ['expired', 'Expired — ask the assistant again'],
  ] as const)('shows a %s proposal as resolved, with no buttons', (status, text) => {
    renderCard(proposal({ status }));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows why a failed proposal could not be applied, e.g. a plan limit', () => {
    renderCard(proposal({ status: 'failed', error: 'Offers are a Pro feature' }));

    expect(screen.getByText('Could not be applied: Offers are a Pro feature')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
