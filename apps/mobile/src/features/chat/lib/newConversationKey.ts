import { hostedAiAvailable } from '../../settings/lib/aiCredits';
import type { AiCredits, AiSource, LlmApiKey } from '../../settings/types';

interface NewConversationSettings {
  keys: LlmApiKey[];
  defaultProvider: string | null;
  aiSource?: AiSource;
  aiCredits?: AiCredits | null;
}

/**
 * The key a new conversation is created with (JEF-503). The user no longer picks
 * one per chat: their AI settings decide.
 *
 * Under the Trakwyn AI source the API ignores any provider a conversation names,
 * so none is sent. Otherwise it is the default key, or the first one when the
 * default was deleted while others remain. The API resolves a missing provider
 * through `defaultLlmProvider` alone and would find no key.
 */
export function keyForNewConversation(settings: NewConversationSettings): LlmApiKey | null {
  if (settings.aiSource === 'trakwyn' && hostedAiAvailable(settings.aiCredits)) return null;
  return (
    settings.keys.find((key) => key.provider === settings.defaultProvider) ??
    settings.keys[0] ??
    null
  );
}
