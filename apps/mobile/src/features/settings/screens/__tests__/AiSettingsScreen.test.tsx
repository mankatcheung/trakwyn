import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useLlmApiKeys', () => ({
  useLlmApiKeys: jest.fn(),
  useLlmUsageSummary: jest.fn(),
  useSaveLlmApiKey: jest.fn(),
  useDeleteLlmApiKey: jest.fn(),
  useSetAiSource: jest.fn(),
  useSetDefaultLlmProvider: jest.fn(),
  useSetLlmApiKeyMonthlyLimit: jest.fn(),
  useTestLlmApiKey: jest.fn(),
  useToggleCrossApplicationContext: jest.fn(),
  useToggleFallbackWhenLimited: jest.fn(),
  useUpdateCustomAiPrompt: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import {
  useDeleteLlmApiKey,
  useLlmApiKeys,
  useLlmUsageSummary,
  useSaveLlmApiKey,
  useSetAiSource,
  useSetDefaultLlmProvider,
  useSetLlmApiKeyMonthlyLimit,
  useTestLlmApiKey,
  useToggleCrossApplicationContext,
  useToggleFallbackWhenLimited,
  useUpdateCustomAiPrompt,
} from '../../hooks/useLlmApiKeys';
import { AiSettingsScreen } from '../AiSettingsScreen';
import type { LlmApiKey } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseLlmApiKeys = jest.mocked(useLlmApiKeys);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLlmUsageSummary = jest.mocked(useLlmUsageSummary);
const mockedUseSaveLlmApiKey = jest.mocked(useSaveLlmApiKey);
const mockedUseDeleteLlmApiKey = jest.mocked(useDeleteLlmApiKey);
const mockedUseSetAiSource = jest.mocked(useSetAiSource);
const mockedUseSetDefaultLlmProvider = jest.mocked(useSetDefaultLlmProvider);
const mockedUseSetLlmApiKeyMonthlyLimit = jest.mocked(useSetLlmApiKeyMonthlyLimit);
const mockedUseTestLlmApiKey = jest.mocked(useTestLlmApiKey);
const mockedUseToggleCrossApplicationContext = jest.mocked(useToggleCrossApplicationContext);
const mockedUseToggleFallbackWhenLimited = jest.mocked(useToggleFallbackWhenLimited);
const mockedUseUpdateCustomAiPrompt = jest.mocked(useUpdateCustomAiPrompt);

const key: LlmApiKey = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: null,
  monthlyTokenLimit: null,
};

function llmApiKeysData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    keys: [key],
    defaultProvider: 'openai',
    customAiPrompt: null,
    useCrossApplicationContext: false,
    llmFallbackWhenLimited: false,
    aiSource: 'auto',
    aiCredits: { used: 18, limit: 30, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
    ...overrides,
  };
}

describe('AiSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseLlmUsageSummary.mockReturnValue({ data: [] } as never);
    mockedUseDeleteLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseSetAiSource.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseSetDefaultLlmProvider.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    mockedUseSetLlmApiKeyMonthlyLimit.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseTestLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseToggleCrossApplicationContext.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    mockedUseToggleFallbackWhenLimited.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    mockedUseUpdateCustomAiPrompt.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
  });

  it('lists configured providers, marking the default', async () => {
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData(),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByText } = await render(<AiSettingsScreen />);

    await waitFor(() => expect(getByText('OpenAI · Default')).toBeTruthy());
  });

  it('opens and closes the add-provider modal', async () => {
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData({ keys: [], defaultProvider: null }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByTestId, queryByTestId } = await render(<AiSettingsScreen />);

    expect(queryByTestId('llm-api-key-input')).toBeNull();

    await fireEvent.press(getByTestId('open-add-provider-button'));
    expect(getByTestId('llm-api-key-input')).toBeTruthy();

    await fireEvent.press(getByTestId('close-add-provider-button'));
    await waitFor(() => expect(queryByTestId('llm-api-key-input')).toBeNull());
  });

  it('saves a new key with the selected provider', async () => {
    const mutate = jest.fn();
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData({ keys: [], defaultProvider: null }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.press(getByTestId('open-add-provider-button'));
    await fireEvent.press(getByTestId('provider-picker-field'));
    await fireEvent.press(getByTestId('provider-option-anthropic'));
    await fireEvent.changeText(getByTestId('llm-api-key-input'), 'sk-ant-test');
    await fireEvent.press(getByTestId('save-llm-key-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', apiKey: 'sk-ant-test' }),
      expect.any(Object),
    );
  });

  it('opens the actions sheet and makes a non-default key the default', async () => {
    const mutate = jest.fn();
    const secondKey: LlmApiKey = {
      provider: 'anthropic',
      model: null,
      baseUrl: null,
      monthlyTokenLimit: null,
    };
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData({ keys: [key, secondKey], defaultProvider: 'openai' }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseSetDefaultLlmProvider.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.press(getByTestId('llm-key-actions-anthropic'));
    await fireEvent.press(getByTestId('sheet-make-default-anthropic'));

    expect(mutate).toHaveBeenCalledWith('anthropic');
  });

  it('saves the custom AI prompt', async () => {
    const mutate = jest.fn();
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData(),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseUpdateCustomAiPrompt.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.changeText(getByTestId('custom-ai-prompt-input'), 'Be concise');
    await fireEvent.press(getByTestId('save-custom-ai-prompt-button'));

    expect(mutate).toHaveBeenCalledWith('Be concise', expect.any(Object));
  });

  it('toggles the fallback-when-limited switch', async () => {
    const mutate = jest.fn();
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData(),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseToggleFallbackWhenLimited.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent(getByTestId('fallback-when-limited-switch'), 'valueChange', true);

    expect(mutate).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('toggles the cross-application context switch', async () => {
    const mutate = jest.fn();
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData(),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseToggleCrossApplicationContext.mockReturnValue({
      mutate,
      isPending: false,
    } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent(getByTestId('cross-application-context-switch'), 'valueChange', true);

    expect(mutate).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('shows the credits meter and saves a picked AI source (JEF-451)', async () => {
    const mutate = jest.fn();
    mockedUseSetAiSource.mockReturnValue({ mutate, isPending: false } as never);
    mockedUseLlmApiKeys.mockReturnValue({
      data: llmApiKeysData(),
      isLoading: false,
      isError: false,
    } as never);

    const { getByText, getByTestId } = await render(<AiSettingsScreen />);
    expect(getByText('12 of 30 left')).toBeTruthy();

    await fireEvent.press(getByTestId('ai-source-option-own'));
    expect(mutate).toHaveBeenCalledWith('own', expect.any(Object));
  });
});
