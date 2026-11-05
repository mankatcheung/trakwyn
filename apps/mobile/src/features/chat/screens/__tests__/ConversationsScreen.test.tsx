import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

// The quota hint is covered by QuotaHint.test.tsx; here it would need a query client of its own.
jest.mock('../../../quota/hooks/useQuotaState', () => ({
  useQuotaState: () => null,
  useQuotaFull: () => false,
}));

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

  it('starts a conversation straight from the FAB, with no picker in between', async () => {
    const push = jest.fn();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'new-conv' });
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId, queryByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('new-conversation-button'));

    expect(queryByTestId('conversation-provider-picker-backdrop')).toBeNull();
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-4o-mini' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('./new-conv'));
  });

  it('creates the conversation with the first key when the default key was deleted', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'new-conv' });
    mockedUseLlmApiKeys.mockReturnValue({
      data: {
        keys: [{ provider: 'anthropic', model: 'claude', baseUrl: null, monthlyTokenLimit: null }],
        defaultProvider: null,
        aiSource: 'auto',
        aiCredits: { used: 0, limit: 0, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
      },
    } as never);
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('new-conversation-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude' }),
    );
  });

  it('names no provider under the Trakwyn AI source, even with a saved key', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'new-conv' });
    mockedUseLlmApiKeys.mockReturnValue({
      data: {
        keys: [
          { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, monthlyTokenLimit: null },
        ],
        defaultProvider: 'openai',
        aiSource: 'trakwyn',
        aiCredits: { used: 0, limit: 300, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
      },
    } as never);
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('new-conversation-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ provider: null, model: null }));
  });

  it('redirects to AI settings instead of creating a conversation when no keys are saved', async () => {
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

    const mutateAsync = jest.fn();
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('new-conversation-button'));

    expect(alert).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
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

  const emptyList = () =>
    mockedUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  const keyless = (aiCredits: unknown) =>
    mockedUseLlmApiKeys.mockReturnValue({
      data: {
        keys: [],
        defaultProvider: null,
        aiSource: 'auto',
        aiCredits,
      },
    } as never);

  it('Pro without a key: starts a Trakwyn AI conversation straight away (JEF-451)', async () => {
    emptyList();
    keyless({ used: 0, limit: 300, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' });
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'hosted-conv' });
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('new-conversation-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ provider: null, model: null }));
  });

  it('Free without a key: the no-keys alert instead of a conversation', async () => {
    emptyList();
    keyless({ used: 0, limit: 0, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' });
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

    const mutateAsync = jest.fn();
    mockedUseCreateConversation.mockReturnValue({ mutateAsync } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('new-conversation-button'));

    expect(alert).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
