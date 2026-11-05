import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useHostedAiAvailable } from '#/lib/aiCredits';
import { useLocale } from '#/lib/i18n';
import {
  TRAKWYN_ENTRY,
  providerEntryLabel,
} from '#/routes/_authenticated/settings/-components/aiProviderOrder';
import {
  LLM_API_KEYS_QUERY,
  type LlmApiKey,
} from '#/routes/_authenticated/settings/-components/shared';

/** The `['llmApiKeys']` query the settings page and the chat surfaces share. */
export interface LlmSettings {
  llmApiKeys: LlmApiKey[];
  /** The providers AI calls try, first to last (JEF-503). */
  me: { aiProviderOrder: string[] };
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
  /** `undefined` while the settings load, or if they failed to. */
  order: string[] | undefined;
  /** `null` while billing status loads. */
  hostedAi: boolean | null;
}

interface StoredConversation {
  llmProvider: string | null;
  llmModel?: string | null;
}

/**
 * The entry that answers: the first one in the user's order that can run. Trakwyn AI
 * cannot on a plan without it, so a list that leads with it still reads as its key
 * for that user. `undefined` when no entry qualifies or the order is not known.
 */
function answeringEntry({ order, hostedAi }: RunsOnContext): string | undefined {
  return order?.find((entry) => entry !== TRAKWYN_ENTRY || hostedAi !== false);
}

/** The order leads with Trakwyn AI but billing status has not said whether the plan has it yet. */
function isUndecided({ order, hostedAi }: RunsOnContext): boolean {
  return order?.[0] === TRAKWYN_ENTRY && hostedAi === null;
}

/**
 * What a conversation runs on now (JEF-503). It is the user's order, not the provider the
 * conversation was started on: a chat is not locked to a key, so the provider stored on
 * the row is only the answer while the order is unknown or empty, and its model only
 * while that same key still leads. Stored data is read through here and never rewritten.
 */
export function conversationRunsOn(
  conversation: StoredConversation,
  context: RunsOnContext,
): RunsOn | null {
  if (isUndecided(context)) return null;
  const entry = answeringEntry(context);
  if (entry === TRAKWYN_ENTRY) return { kind: 'trakwyn' };
  if (entry) {
    const startedHere = conversation.llmProvider === entry;
    return {
      kind: 'key',
      provider: entry,
      model: startedHere ? (conversation.llmModel ?? null) : null,
    };
  }
  if (!conversation.llmProvider) return null;
  return { kind: 'key', provider: conversation.llmProvider, model: conversation.llmModel ?? null };
}

/** What a new conversation will run on, so the header can say so. `null` when nothing can. */
export function newConversationRunsOn(context: RunsOnContext): RunsOn | null {
  return conversationRunsOn({ llmProvider: null }, context);
}

/**
 * Resolves what answers for the chat surfaces. Nothing is answered until the settings
 * have loaded, and not for a user whose order leads with Trakwyn AI until billing status
 * has too, so a list never flashes a provider that is about to be replaced.
 */
export function useChatRunsOn() {
  const { t } = useLocale();
  const hostedAi = useHostedAiAvailable();
  const { data, isPending } = useLlmSettings();
  const context: RunsOnContext = { order: data?.me?.aiProviderOrder, hostedAi };
  const ready = !isPending;

  const label = useCallback(
    (runsOn: RunsOn | null): string | null => {
      if (!runsOn) return null;
      return providerEntryLabel(runsOn.kind === 'trakwyn' ? TRAKWYN_ENTRY : runsOn.provider, t);
    },
    [t],
  );

  return {
    ready,
    settings: data,
    runsOnFor: (conversation: StoredConversation) =>
      ready ? conversationRunsOn(conversation, context) : null,
    newRunsOn: ready ? newConversationRunsOn(context) : null,
    label,
  };
}
