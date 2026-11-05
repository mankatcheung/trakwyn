import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useHostedAiAvailable } from '#/lib/aiCredits';
import { useLocale } from '#/lib/i18n';
import {
  LLM_API_KEYS_QUERY,
  LLM_PROVIDER_LABEL,
  type LlmApiKey,
} from '#/routes/_authenticated/settings/-components/shared';

/** The `['llmApiKeys']` query the settings page and the chat surfaces share. */
export interface LlmSettings {
  llmApiKeys: LlmApiKey[];
  me: { defaultLlmProvider: string | null; aiSource?: string };
}

export function useLlmSettings() {
  return useQuery({
    queryKey: ['llmApiKeys'],
    queryFn: () => gqlClient.request<LlmSettings>(LLM_API_KEYS_QUERY),
  });
}

/** What answers a conversation: the platform, or one of the user's own keys. */
export type RunsOn = { kind: 'trakwyn' } | { kind: 'key'; provider: string; model: string | null };

interface RunsOnContext {
  /** `undefined` while the settings load (or if they failed to). */
  aiSource: string | undefined;
  /** `null` while billing status loads. */
  hostedAi: boolean | null;
}

/** Under Trakwyn AI the API ignores any provider a conversation names (`UserLLMProviderFactory`). */
function usesTrakwynAi({ aiSource, hostedAi }: RunsOnContext): boolean {
  return aiSource === 'trakwyn' && hostedAi === true;
}

/** The source says Trakwyn AI but billing status has not said whether it is available yet. */
function isUndecided({ aiSource, hostedAi }: RunsOnContext): boolean {
  return aiSource === 'trakwyn' && hostedAi === null;
}

/**
 * What an existing conversation actually runs on. The provider stored on the
 * row is only the answer when the user's own key is in play: with the source
 * set to Trakwyn AI it is ignored, so showing it would be wrong. Stored data
 * is never rewritten, only read through here.
 */
export function conversationRunsOn(
  conversation: { llmProvider: string | null; llmModel?: string | null },
  context: RunsOnContext,
): RunsOn | null {
  if (isUndecided(context)) return null;
  if (usesTrakwynAi(context)) return { kind: 'trakwyn' };
  if (!conversation.llmProvider) return null;
  return { kind: 'key', provider: conversation.llmProvider, model: conversation.llmModel ?? null };
}

/** The provider a new conversation will use, so the header can say so. `null` when there is no key. */
export function newConversationRunsOn(
  settings: Pick<LlmSettings, 'llmApiKeys' | 'me'> | undefined,
  context: RunsOnContext,
): RunsOn | null {
  if (isUndecided(context)) return null;
  if (usesTrakwynAi(context)) return { kind: 'trakwyn' };
  const provider = ownProvider(settings);
  return provider ? { kind: 'key', provider, model: null } : null;
}

/** The user's default key, or the first one when the default was deleted. */
function ownProvider(settings: Pick<LlmSettings, 'llmApiKeys' | 'me'> | undefined): string | null {
  return settings?.me?.defaultLlmProvider ?? settings?.llmApiKeys?.[0]?.provider ?? null;
}

/**
 * The provider to create a conversation with. Not asked of the user any more
 * (JEF-503), but the API falls back to `defaultLlmProvider` and finds no key
 * when that was deleted while others remain, which the old picker papered over
 * by preselecting the first key. Under Trakwyn AI the API ignores it, so none
 * is named.
 */
export function providerForNewConversation(
  settings: Pick<LlmSettings, 'llmApiKeys' | 'me'> | undefined,
  context: RunsOnContext,
): string | null {
  if (usesTrakwynAi(context)) return null;
  return ownProvider(settings);
}

/**
 * Resolves the Trakwyn AI / own key decision for the chat surfaces. Nothing is
 * answered until the settings have loaded, and not for a Trakwyn AI user until
 * billing status has too, so a list never flashes a provider that is about to
 * be replaced by "Trakwyn AI".
 */
export function useChatRunsOn() {
  const { t } = useLocale();
  const hostedAi = useHostedAiAvailable();
  const { data, isPending } = useLlmSettings();
  const context: RunsOnContext = { aiSource: data?.me?.aiSource, hostedAi };
  const ready = !isPending;

  const label = useCallback(
    (runsOn: RunsOn | null): string | null => {
      if (!runsOn) return null;
      return runsOn.kind === 'trakwyn'
        ? t('aiSource.trakwyn')
        : (LLM_PROVIDER_LABEL[runsOn.provider] ?? runsOn.provider);
    },
    [t],
  );

  return {
    ready,
    settings: data,
    context,
    runsOnFor: (conversation: { llmProvider: string | null; llmModel?: string | null }) =>
      ready ? conversationRunsOn(conversation, context) : null,
    newRunsOn: ready ? newConversationRunsOn(data, context) : null,
    newConversationProvider: providerForNewConversation(data, context),
    label,
  };
}
