import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useLlmApiKeys', () => ({
  useLlmApiKeys: jest.fn(),
  useLlmUsageSummary: jest.fn(),
  useSaveLlmApiKey: jest.fn(),
  useDeleteLlmApiKey: jest.fn(),
  useSetAiProviderOrder: jest.fn(),
  useSetLlmApiKeyMonthlyLimit: jest.fn(),
  useTestLlmApiKey: jest.fn(),
  useToggleCrossApplicationContext: jest.fn(),
  useUpdateCustomAiPrompt: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import {
  useDeleteLlmApiKey,
  useLlmApiKeys,
  useLlmUsageSummary,
  useSaveLlmApiKey,
  useSetAiProviderOrder,
  useSetLlmApiKeyMonthlyLimit,
  useTestLlmApiKey,
  useToggleCrossApplicationContext,
  useUpdateCustomAiPrompt,
} from '../../hooks/useLlmApiKeys';
import { AiSettingsScreen } from '../AiSettingsScreen';
import { LLM_PROVIDER_DATA_USE_URL, type LlmApiKey } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseLlmApiKeys = jest.mocked(useLlmApiKeys);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLlmUsageSummary = jest.mocked(useLlmUsageSummary);
const mockedUseSaveLlmApiKey = jest.mocked(useSaveLlmApiKey);
const mockedUseDeleteLlmApiKey = jest.mocked(useDeleteLlmApiKey);
const mockedUseSetAiProviderOrder = jest.mocked(useSetAiProviderOrder);
const mockedUseSetLlmApiKeyMonthlyLimit = jest.mocked(useSetLlmApiKeyMonthlyLimit);
const mockedUseTestLlmApiKey = jest.mocked(useTestLlmApiKey);
const mockedUseToggleCrossApplicationContext = jest.mocked(useToggleCrossApplicationContext);
const mockedUseUpdateCustomAiPrompt = jest.mocked(useUpdateCustomAiPrompt);

const key: LlmApiKey = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: null,
  monthlyTokenLimit: null,
};
const secondKey: LlmApiKey = {
  provider: 'anthropic',
  model: null,
  baseUrl: null,
  monthlyTokenLimit: null,
};

function llmApiKeysData(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    keys: [key],
    aiProviderOrder: ['openai'],
    customAiPrompt: null,
    useCrossApplicationContext: false,
    aiCredits: { used: 18, limit: 30, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
    ...overrides,
  };
}

function loaded(data: unknown) {
  mockedUseLlmApiKeys.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
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
    mockedUseSaveLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseSetAiProviderOrder.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseSetLlmApiKeyMonthlyLimit.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseTestLlmApiKey.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseToggleCrossApplicationContext.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    mockedUseUpdateCustomAiPrompt.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
  });

  it('lists configured providers, without a default marker (JEF-503)', async () => {
    loaded(llmApiKeysData());

    const { getByText, queryByText } = await render(<AiSettingsScreen />);

    await waitFor(() => expect(getByText('gpt-4o-mini')).toBeTruthy());
    expect(queryByText(/Default/)).toBeNull();
  });

  it('opens and closes the add-provider modal', async () => {
    loaded(llmApiKeysData({ keys: [], aiProviderOrder: [] }));

    const { getByTestId, queryByTestId } = await render(<AiSettingsScreen />);

    expect(queryByTestId('llm-api-key-input')).toBeNull();

    await fireEvent.press(getByTestId('open-add-provider-button'));
    expect(getByTestId('llm-api-key-input')).toBeTruthy();

    await fireEvent.press(getByTestId('close-add-provider-button'));
    await waitFor(() => expect(queryByTestId('llm-api-key-input')).toBeNull());
  });

  it('saves a new key with the selected provider', async () => {
    const mutate = jest.fn();
    loaded(llmApiKeysData({ keys: [], aiProviderOrder: [] }));
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

  it('links to the chosen provider’s data-use policy, and hints for custom (JEF-549)', async () => {
    loaded(llmApiKeysData({ keys: [], aiProviderOrder: [] }));
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    const { getByTestId, queryByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.press(getByTestId('open-add-provider-button'));
    await fireEvent.press(getByTestId('provider-picker-field'));
    await fireEvent.press(getByTestId('provider-option-anthropic'));

    await fireEvent.press(getByTestId('provider-data-use-link'));
    expect(openURL).toHaveBeenCalledWith(LLM_PROVIDER_DATA_USE_URL.anthropic);
    expect(openURL.mock.calls[0][0]).toMatch(/^https:\/\//);
    expect(queryByTestId('provider-data-use-hint')).toBeNull();

    await fireEvent.press(getByTestId('provider-picker-field'));
    await fireEvent.press(getByTestId('provider-option-custom'));

    expect(queryByTestId('provider-data-use-link')).toBeNull();
    expect(getByTestId('provider-data-use-hint')).toBeTruthy();
    openURL.mockRestore();
  });

  it('opens the actions sheet for a key, with no make-default action (JEF-503)', async () => {
    loaded(llmApiKeysData({ keys: [key, secondKey], aiProviderOrder: ['openai', 'anthropic'] }));

    const { getByTestId, queryByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.press(getByTestId('llm-key-actions-anthropic'));

    expect(getByTestId('sheet-test-anthropic')).toBeTruthy();
    expect(getByTestId('sheet-limit-anthropic')).toBeTruthy();
    expect(queryByTestId('sheet-make-default-anthropic')).toBeNull();
  });

  it('saves the custom AI prompt', async () => {
    const mutate = jest.fn();
    loaded(llmApiKeysData());
    mockedUseUpdateCustomAiPrompt.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent.changeText(getByTestId('custom-ai-prompt-input'), 'Be concise');
    await fireEvent.press(getByTestId('save-custom-ai-prompt-button'));

    expect(mutate).toHaveBeenCalledWith('Be concise', expect.any(Object));
  });

  it('no longer has a fall-through switch: the provider order replaces it (JEF-503)', async () => {
    loaded(llmApiKeysData());

    const { queryByTestId } = await render(<AiSettingsScreen />);

    expect(queryByTestId('fallback-when-limited-switch')).toBeNull();
  });

  it('toggles the cross-application context switch', async () => {
    const mutate = jest.fn();
    loaded(llmApiKeysData());
    mockedUseToggleCrossApplicationContext.mockReturnValue({
      mutate,
      isPending: false,
    } as never);

    const { getByTestId } = await render(<AiSettingsScreen />);

    await fireEvent(getByTestId('cross-application-context-switch'), 'valueChange', true);

    expect(mutate).toHaveBeenCalledWith(true, expect.any(Object));
  });

  describe('which AI answers (JEF-503)', () => {
    it('lists the providers in the order they are tried', async () => {
      loaded(llmApiKeysData({ keys: [key, secondKey], aiProviderOrder: ['anthropic', 'openai'] }));

      const { getByTestId } = await render(<AiSettingsScreen />);

      expect(getByTestId('ai-order-anthropic')).toBeTruthy();
      expect(getByTestId('ai-order-openai')).toBeTruthy();
    });

    it('saves the whole list when a provider is moved', async () => {
      const mutate = jest.fn();
      mockedUseSetAiProviderOrder.mockReturnValue({ mutate, isPending: false } as never);
      loaded(llmApiKeysData({ keys: [key, secondKey], aiProviderOrder: ['openai', 'anthropic'] }));

      const { getByTestId } = await render(<AiSettingsScreen />);
      await fireEvent.press(getByTestId('ai-order-down-openai'));

      expect(mutate).toHaveBeenCalledWith(['anthropic', 'openai'], expect.any(Object));
    });

    it('adds Trakwyn AI after the keys already listed', async () => {
      const mutate = jest.fn();
      mockedUseSetAiProviderOrder.mockReturnValue({ mutate, isPending: false } as never);
      loaded(llmApiKeysData());

      const { getByTestId } = await render(<AiSettingsScreen />);
      await fireEvent.press(getByTestId('ai-order-add-trakwyn'));

      expect(mutate).toHaveBeenCalledWith(['openai', 'trakwyn'], expect.any(Object));
    });

    it('says so when saving fails', async () => {
      // An API error reads as the API's own message, which is what the user is shown.
      const apiError = {
        response: { errors: [{ message: 'Add an API key for groq before listing it' }] },
      };
      const mutate = jest.fn((_order, options) => options.onError(apiError));
      mockedUseSetAiProviderOrder.mockReturnValue({ mutate, isPending: false } as never);
      loaded(llmApiKeysData({ keys: [key, secondKey], aiProviderOrder: ['openai', 'anthropic'] }));

      const { getByTestId, findByText } = await render(<AiSettingsScreen />);
      await fireEvent.press(getByTestId('ai-order-down-openai'));

      expect(await findByText('Add an API key for groq before listing it')).toBeTruthy();
    });

    it('shows the credits meter alongside the list (JEF-451)', async () => {
      loaded(llmApiKeysData({ aiProviderOrder: ['trakwyn'] }));

      const { getByText, getByTestId } = await render(<AiSettingsScreen />);

      expect(getByText('12 of 30 left')).toBeTruthy();
      expect(getByTestId('ai-order-trakwyn')).toBeTruthy();
    });
  });

  it('Free: hides the meter and Trakwyn AI, and points at Pro (JEF-451)', async () => {
    loaded(
      llmApiKeysData({
        aiCredits: { used: 0, limit: 0, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
      }),
    );

    const { getByTestId, queryByTestId, getByText } = await render(<AiSettingsScreen />);
    expect(getByText('Trakwyn AI is included with Pro')).toBeTruthy();
    expect(getByTestId('ai-pro-note-upgrade-button')).toBeTruthy();
    expect(queryByTestId('ai-credits-card')).toBeNull();
    expect(queryByTestId('ai-credits-left')).toBeNull();
    expect(queryByTestId('ai-order-add-trakwyn')).toBeNull();
    // The own-key flow is still there.
    expect(getByTestId('open-add-provider-button')).toBeTruthy();
  });
});
