import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  DELETE_LLM_API_KEY_MUTATION,
  LLM_API_KEYS_QUERY,
  LLM_USAGE_SUMMARY_QUERY,
  SAVE_LLM_API_KEY_MUTATION,
  SET_DEFAULT_LLM_PROVIDER_MUTATION,
  SET_LLM_API_KEY_MONTHLY_LIMIT_MUTATION,
  TEST_LLM_API_KEY_MUTATION,
  UPDATE_PROFILE_MUTATION,
} from '../graphql/operations';
import type { LlmApiKey, LlmUsageSummary } from '../types';

export const llmApiKeysQueryKey = ['llmApiKeys'] as const;
export const llmUsageSummaryQueryKey = ['llmUsageSummary'] as const;

interface LlmApiKeysResult {
  keys: LlmApiKey[];
  defaultProvider: string | null;
  customAiPrompt: string | null;
  useCrossApplicationContext: boolean;
  llmFallbackWhenLimited: boolean;
}

export function useLlmApiKeys() {
  return useQuery({
    queryKey: llmApiKeysQueryKey,
    queryFn: () =>
      gqlRequest<{
        llmApiKeys: LlmApiKey[];
        me: {
          defaultLlmProvider: string | null;
          customAiPrompt: string | null;
          useCrossApplicationContext: boolean;
          llmFallbackWhenLimited: boolean;
        };
      }>(LLM_API_KEYS_QUERY).then((data): LlmApiKeysResult => ({
        keys: data.llmApiKeys,
        defaultProvider: data.me.defaultLlmProvider,
        customAiPrompt: data.me.customAiPrompt,
        useCrossApplicationContext: data.me.useCrossApplicationContext,
        llmFallbackWhenLimited: data.me.llmFallbackWhenLimited,
      })),
  });
}

// Separate query so a slow/failed usage lookup never blocks the keys list
// itself from rendering (mirrors apps/web's SettingsAiPage, JEF-250).
export function useLlmUsageSummary() {
  return useQuery({
    queryKey: llmUsageSummaryQueryKey,
    queryFn: () =>
      gqlRequest<{ llmUsageSummary: LlmUsageSummary[] }>(LLM_USAGE_SUMMARY_QUERY).then(
        (data) => data.llmUsageSummary,
      ),
  });
}

export interface SaveLlmApiKeyInput {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function useSaveLlmApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveLlmApiKeyInput) =>
      gqlRequest<{ saveLlmApiKey: boolean }>(SAVE_LLM_API_KEY_MUTATION, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}

export function useDeleteLlmApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      gqlRequest<{ deleteLlmApiKey: boolean }>(DELETE_LLM_API_KEY_MUTATION, { provider }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}

export function useSetDefaultLlmProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) =>
      gqlRequest<{ setDefaultLlmProvider: boolean }>(SET_DEFAULT_LLM_PROVIDER_MUTATION, {
        provider,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}

export interface SetLlmApiKeyMonthlyLimitInput {
  provider: string;
  monthlyTokenLimit: number | null;
}

export function useSetLlmApiKeyMonthlyLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, monthlyTokenLimit }: SetLlmApiKeyMonthlyLimitInput) =>
      gqlRequest<{ setLlmApiKeyMonthlyLimit: boolean }>(SET_LLM_API_KEY_MONTHLY_LIMIT_MUTATION, {
        provider,
        monthlyTokenLimit,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
        queryClient.invalidateQueries({ queryKey: llmUsageSummaryQueryKey }),
      ]),
  });
}

export interface TestLlmApiKeyInput {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function useTestLlmApiKey() {
  return useMutation({
    mutationFn: (input: TestLlmApiKeyInput) =>
      gqlRequest<{ testLlmApiKey: { ok: boolean; error: string | null } }>(
        TEST_LLM_API_KEY_MUTATION,
        input,
      ).then((data) => data.testLlmApiKey),
  });
}

// The three AI-related profile fields below all live on `updateProfile` (the
// same mutation the Profile screen uses), but each invalidates the
// llmApiKeys cache rather than the profile cache since that's what this
// screen reads from.

export function useUpdateCustomAiPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customAiPrompt: string | null) =>
      gqlRequest<{ updateProfile: boolean }>(UPDATE_PROFILE_MUTATION, { customAiPrompt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}

export function useToggleFallbackWhenLimited() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (llmFallbackWhenLimited: boolean) =>
      gqlRequest<{ updateProfile: boolean }>(UPDATE_PROFILE_MUTATION, {
        llmFallbackWhenLimited,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}

export function useToggleCrossApplicationContext() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (useCrossApplicationContext: boolean) =>
      gqlRequest<{ updateProfile: boolean }>(UPDATE_PROFILE_MUTATION, {
        useCrossApplicationContext,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}
