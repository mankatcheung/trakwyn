import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../hooks/useChatHistory', () => ({
  useChatHistory: jest.fn(),
  useAppendOptimisticMessage: jest.fn(),
  chatHistoryQueryKey: (id: string) => ['chatHistory', id],
}));
jest.mock('../../hooks/useConversations', () => ({
  conversationsQueryKey: ['conversations'],
}));
jest.mock('../../lib/chatStream', () => ({
  streamChatMessage: jest.fn(),
  ChatStreamError: class ChatStreamError extends Error {},
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useAppendOptimisticMessage, useChatHistory } from '../../hooks/useChatHistory';
import { streamChatMessage } from '../../lib/chatStream';
import { ChatScreen } from '../ChatScreen';
import type { ChatMessage } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseChatHistory = jest.mocked(useChatHistory);
const mockedUseAppendOptimisticMessage = jest.mocked(useAppendOptimisticMessage);
const mockedStreamChatMessage = jest.mocked(streamChatMessage);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const message: ChatMessage = {
  id: '1',
  role: 'assistant',
  content: 'Hello!',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen(conversationId: string, initialMessage?: string) {
  mockedUseLocalSearchParams.mockReturnValue({ id: conversationId, initialMessage } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatScreen />
    </QueryClientProvider>,
  );
}

describe('ChatScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseAppendOptimisticMessage.mockReturnValue(jest.fn());
  });

  it('renders existing messages', async () => {
    mockedUseChatHistory.mockReturnValue({ data: [message], isLoading: false } as never);

    const { getByText } = await renderScreen('conv-1');

    await waitFor(() => expect(getByText('Hello!')).toBeTruthy());
  });

  it('sends a message and streams the reply', async () => {
    mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
    mockedStreamChatMessage.mockResolvedValueOnce(undefined);

    const { getByTestId } = await renderScreen('conv-1');

    await fireEvent.changeText(getByTestId('chat-input'), 'What should I ask in my interview?');
    await fireEvent.press(getByTestId('chat-send-button'));

    await waitFor(() =>
      expect(mockedStreamChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          message: 'What should I ask in my interview?',
        }),
      ),
    );
  });

  it('auto-sends the initial message from a freshly created conversation', async () => {
    mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
    mockedStreamChatMessage.mockResolvedValueOnce(undefined);

    await renderScreen('new-conv', 'Hi there');

    await waitFor(() =>
      expect(mockedStreamChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'new-conv', message: 'Hi there' }),
      ),
    );
  });
});
