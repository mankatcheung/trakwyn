import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    ASSISTANT_CHANGE_CONFIRMED: 'assistant_change_confirmed',
    ASSISTANT_CHANGE_DISMISSED: 'assistant_change_dismissed',
  },
  captureEvent: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { gqlRequest } from '../../../../graphql/client';
import { captureEvent } from '../../../../lib/analytics';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { ChatProposalCard } from '../ChatProposalCard';
import type { ChatProposal } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUseTheme = jest.mocked(useTheme);

const proposal = (overrides?: Partial<ChatProposal>): ChatProposal => ({
  id: 'p1',
  toolName: 'update_application',
  summary: 'Move Acme / Engineer to interviewing',
  status: 'pending',
  error: null,
  ...overrides,
});

let queryClient: QueryClient;
async function renderCard(p: ChatProposal) {
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProposalCard proposal={p} conversationId="c1" />
    </QueryClientProvider>,
  );
}

describe('ChatProposalCard (JEF-469)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGqlRequest.mockResolvedValue({} as never);
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('shows the summary with Confirm and Dismiss while pending', async () => {
    const { getByText, getByTestId } = await renderCard(proposal());

    expect(getByText('Move Acme / Engineer to interviewing')).toBeTruthy();
    expect(getByTestId('chat-proposal-confirm-p1')).toBeTruthy();
    expect(getByTestId('chat-proposal-dismiss-p1')).toBeTruthy();
  });

  it('sends only the id on Confirm, refreshes the app and records the event', async () => {
    const { getByTestId } = await renderCard(proposal());
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    fireEvent.press(getByTestId('chat-proposal-confirm-p1'));

    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalledTimes(1));
    expect(mockedGqlRequest.mock.calls[0][0]).toContain('confirmChatAction');
    expect(mockedGqlRequest.mock.calls[0][1]).toEqual({ id: 'p1' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
    expect(captureEvent).toHaveBeenCalledWith('assistant_change_confirmed', {
      tool: 'update_application',
    });
  });

  it('dismisses with the id and refreshes only the conversation', async () => {
    const { getByTestId } = await renderCard(proposal());
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    fireEvent.press(getByTestId('chat-proposal-dismiss-p1'));

    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalledTimes(1));
    expect(mockedGqlRequest.mock.calls[0][0]).toContain('dismissChatAction');
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chatHistory', 'c1'] }),
    );
  });

  it('ignores a second press while a request is in flight', async () => {
    mockedGqlRequest.mockReturnValue(new Promise(() => {}) as never);
    const { getByTestId } = await renderCard(proposal());

    fireEvent.press(getByTestId('chat-proposal-confirm-p1'));
    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalledTimes(1));
    fireEvent.press(getByTestId('chat-proposal-confirm-p1'));
    fireEvent.press(getByTestId('chat-proposal-dismiss-p1'));

    expect(mockedGqlRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['confirmed', 'Done'],
    ['dismissed', 'Dismissed'],
    ['expired', 'Expired — ask the assistant again'],
  ] as const)('shows a %s proposal as resolved, without buttons', async (status, text) => {
    const { getByText, queryByTestId } = await renderCard(proposal({ status }));

    expect(getByText(text)).toBeTruthy();
    expect(queryByTestId('chat-proposal-confirm-p1')).toBeNull();
  });

  it('shows why a failed proposal could not be applied', async () => {
    const { getByText } = await renderCard(
      proposal({ status: 'failed', error: 'Offers are a Pro feature' }),
    );

    expect(getByText('Could not be applied: Offers are a Pro feature')).toBeTruthy();
  });
});
