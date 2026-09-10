import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useConversations', () => ({
  useConversations: jest.fn(),
  useDeleteConversation: jest.fn(),
  useCreateConversation: jest.fn(),
}));
jest.mock('../../../settings/hooks/useLlmApiKeys', () => ({
  useLlmApiKeys: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
} from '../../hooks/useConversations';
import { useLlmApiKeys } from '../../../settings/hooks/useLlmApiKeys';
import { ConversationsScreen } from '../ConversationsScreen';
import type { Conversation } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseConversations = jest.mocked(useConversations);
const mockedUseCreateConversation = jest.mocked(useCreateConversation);
const mockedUseDeleteConversation = jest.mocked(useDeleteConversation);
const mockedUseLlmApiKeys = jest.mocked(useLlmApiKeys);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const conversation: Conversation = {
  id: '1',
  title: 'Stripe interview prep',
  llmProvider: 'openai',
  llmModel: 'gpt-4o-mini',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen(push = jest.fn(), replace = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push, replace } as never);
  return render(<ConversationsScreen />);
}

describe('ConversationsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseDeleteConversation.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseCreateConversation.mockReturnValue({ mutateAsync: jest.fn() } as never);
    mockedUseLlmApiKeys.mockReturnValue({
      data: {
        keys: [
          { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, monthlyTokenLimit: null },
        ],
        defaultProvider: 'openai',
        customAiPrompt: null,
        useCrossApplicationContext: false,
        llmFallbackWhenLimited: true,
      },
    } as never);
  });

  it('renders conversations and navigates to Chat on press', async () => {
    const push = jest.fn();
    mockedUseConversations.mockReturnValue({
      data: [conversation],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId, getByText } = await renderScreen(push);

    await waitFor(() => expect(getByText('Stripe interview prep')).toBeTruthy());
    await fireEvent.press(getByTestId('conversation-1'));

    expect(push).toHaveBeenCalledWith('./1');
  });

  it('renders a FAB that opens the model picker instead of creating immediately', async () => {
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('new-conversation-button'));

    expect(getByTestId('conversation-provider-picker-backdrop')).toBeTruthy();
    expect(getByTestId('conversation-provider-option-openai')).toBeTruthy();
  });

  it('creates a conversation with the selected provider/model and navigates into it', async () => {
    const push = jest.fn();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'new-conv' });
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('new-conversation-button'));
    await fireEvent.press(getByTestId('conversation-provider-option-openai'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-4o-mini' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('./new-conv'));
  });

  it('redirects to AI settings instead of opening the picker when no keys are saved', async () => {
    const push = jest.fn();
    mockedUseLlmApiKeys.mockReturnValue({
      data: {
        keys: [],
        defaultProvider: null,
        customAiPrompt: null,
        useCrossApplicationContext: false,
        llmFallbackWhenLimited: true,
      },
    } as never);
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId, queryByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('new-conversation-button'));

    expect(queryByTestId('conversation-provider-picker-backdrop')).toBeNull();
  });

  it('does not show a chat composer on the conversation list', async () => {
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('assistant-composer-input')).toBeNull();
  });

  it('shows an icon-only delete control with no visible label', async () => {
    mockedUseConversations.mockReturnValue({
      data: [conversation],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('delete-conversation-1')).toBeTruthy());
    expect(queryByText('Delete')).toBeNull();
  });
});
