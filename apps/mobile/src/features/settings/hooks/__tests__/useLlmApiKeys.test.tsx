import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useDeleteLlmApiKey,
  useLlmApiKeys,
  useLlmUsageSummary,
  useSaveLlmApiKey,
  useSetDefaultLlmProvider,
  useSetLlmApiKeyMonthlyLimit,
  useTestLlmApiKey,
  useToggleCrossApplicationContext,
  useToggleFallbackWhenLimited,
  useUpdateCustomAiPrompt,
} from '../useLlmApiKeys';
import type { LlmApiKey, LlmUsageSummary } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const key: LlmApiKey = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: null,
  monthlyTokenLimit: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useLlmApiKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches keys and the default provider', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      llmApiKeys: [key],
      me: {
        defaultLlmProvider: 'openai',
        customAiPrompt: 'Keep it short',
        useCrossApplicationContext: true,
        llmFallbackWhenLimited: false,
      },
    });

    const { result } = await renderHook(() => useLlmApiKeys(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      keys: [key],
      defaultProvider: 'openai',
      customAiPrompt: 'Keep it short',
      useCrossApplicationContext: true,
      llmFallbackWhenLimited: false,
    });
  });

  it('fetches the usage summary', async () => {
    const usage: LlmUsageSummary = {
      provider: 'openai',
      requestCount: 3,
      promptTokens: 100,
      completionTokens: 50,
      lastUsedAt: '2026-01-01T00:00:00.000Z',
      monthlyTokenLimit: 1000,
      limitReached: false,
    };
    mockedGqlRequest.mockResolvedValueOnce({ llmUsageSummary: [usage] });

    const { result } = await renderHook(() => useLlmUsageSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([usage]);
  });

  it('sets a monthly token limit', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ setLlmApiKeyMonthlyLimit: true });
    const { result } = await renderHook(() => useSetLlmApiKeyMonthlyLimit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ provider: 'openai', monthlyTokenLimit: 1000 });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      provider: 'openai',
      monthlyTokenLimit: 1000,
    });
  });

  it('updates the custom AI prompt', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateProfile: true });
    const { result } = await renderHook(() => useUpdateCustomAiPrompt(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('Be concise');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      customAiPrompt: 'Be concise',
    });
  });

  it('toggles fallback when limited', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateProfile: true });
    const { result } = await renderHook(() => useToggleFallbackWhenLimited(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(true);
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      llmFallbackWhenLimited: true,
    });
  });

  it('toggles cross-application context', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateProfile: true });
    const { result } = await renderHook(() => useToggleCrossApplicationContext(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(true);
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      useCrossApplicationContext: true,
    });
  });

  it('saves a key', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ saveLlmApiKey: true });
    const { result } = await renderHook(() => useSaveLlmApiKey(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ provider: 'openai', apiKey: 'sk-test' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      provider: 'openai',
      apiKey: 'sk-test',
    });
  });

  it('deletes a key', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ deleteLlmApiKey: true });
    const { result } = await renderHook(() => useDeleteLlmApiKey(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('openai');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { provider: 'openai' });
  });

  it('sets the default provider', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ setDefaultLlmProvider: true });
    const { result } = await renderHook(() => useSetDefaultLlmProvider(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('anthropic');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { provider: 'anthropic' });
  });

  it('tests a key', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ testLlmApiKey: { ok: true, error: null } });
    const { result } = await renderHook(() => useTestLlmApiKey(), { wrapper });

    let outcome: { ok: boolean; error: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ provider: 'openai', apiKey: 'sk-test' });
    });

    expect(outcome).toEqual({ ok: true, error: null });
  });
});
