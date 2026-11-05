import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  DELETE_LLM_API_KEY_MUTATION,
  LLM_API_KEYS_QUERY,
  LLM_USAGE_SUMMARY_QUERY,
  SAVE_LLM_API_KEY_MUTATION,
  SET_AI_PROVIDER_ORDER_MUTATION,
  SET_LLM_API_KEY_MONTHLY_LIMIT_MUTATION,
  TEST_LLM_API_KEY_MUTATION,
  UPDATE_PROFILE_MUTATION,
} from '../graphql/operations';
import type { AiCredits, LlmApiKey, LlmUsageSummary } from '../types';

export const llmApiKeysQueryKey = ['llmApiKeys'] as const;
export const llmUsageSummaryQueryKey = ['llmUsageSummary'] as const;

interface LlmApiKeysResult {
  keys: LlmApiKey[];
  /** The providers AI calls try, first to last (JEF-503). */
  aiProviderOrder: string[];
  customAiPrompt: string | null;
  useCrossApplicationContext: boolean;
  aiCredits: AiCredits;
}

export function useLlmApiKeys() {
  return useQuery({
    queryKey: llmApiKeysQueryKey,
    queryFn: () =>
      gqlRequest<{
        llmApiKeys: LlmApiKey[];
        me: {
          aiProviderOrder: string[];
          customAiPrompt: string | null;
          useCrossApplicationContext: boolean;
          aiCredits: AiCredits;
        };
      }>(LLM_API_KEYS_QUERY).then((data): LlmApiKeysResult => ({
        keys: data.llmApiKeys,
        aiProviderOrder: data.me.aiProviderOrder,
        customAiPrompt: data.me.customAiPrompt,
        useCrossApplicationContext: data.me.useCrossApplicationContext,
        aiCredits: data.me.aiCredits,
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

/** Saves which providers AI calls try, in order (JEF-503). Replaces the source, default and fall-through settings. */
export function useSetAiProviderOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) =>
      gqlRequest<{ setAiProviderOrder: boolean }>(SET_AI_PROVIDER_ORDER_MUTATION, { order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
  });
}
