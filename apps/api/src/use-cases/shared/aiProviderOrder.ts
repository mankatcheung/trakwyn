import { AI_PROVIDER_ORDER, AI_SOURCE } from '#src/use-cases/constants.js';
import { effectivePlan } from '#src/domain/plan/Plan.js';
import type { AiSource } from '#src/domain/user/AiSource.js';
import type { LlmApiKey } from '#src/domain/llmApiKey/LlmApiKey.js';
import type { User } from '#src/domain/user/User.js';

/** The user fields an order is derived from when they have not set one. */
export interface AiProviderOrderSettings {
  aiProviderOrder: string[] | null;
  aiSource: AiSource;
  defaultLlmProvider: string | null;
  llmFallbackWhenLimited: boolean;
}

/**
 * Whether the platform's key can answer a user who has no own key and left
 * the source on `auto`. Hosted AI is Pro-only and rolled out in stages, so this
 * is the one place those two facts meet the derived order.
 */
export interface AiProviderOrderContext {
  autoMayUseTrakwyn: boolean;
}

/**
 * The providers a user's AI calls try, first to last (JEF-503).
 *
 * A list the user saved is returned as stored: whether each entry can run right
 * now (a key still exists, hosted AI is on for them) is the caller's to check
 * at the moment of the call, so an entry that cannot is skipped and never
 * replaced by one the user did not list.
 *
 * With no saved list the order is what the three older settings already meant,
 * so nothing changed for anyone when the list arrived:
 *
 * - `trakwyn`: the platform only.
 * - `own`: the default key, then the other keys oldest first when the user opted
 *   into falling through at a monthly limit (JEF-258).
 * - `auto`: the same own-key chain when there is a key, otherwise the platform
 *   if `autoMayUseTrakwyn`.
 *
 * `keyProviders` is the user's saved keys, oldest first. A deleted default
 * leaves the oldest key standing in for it rather than none.
 */
export function effectiveAiProviderOrder(
  settings: AiProviderOrderSettings,
  keyProviders: readonly string[],
  context: AiProviderOrderContext,
): string[] {
  if (settings.aiProviderOrder) return [...settings.aiProviderOrder];

  const own = ownKeyChain(settings, keyProviders);
  switch (settings.aiSource) {
    case AI_SOURCE.TRAKWYN:
      return [AI_PROVIDER_ORDER.TRAKWYN];
    case AI_SOURCE.OWN:
      return own;
    case AI_SOURCE.AUTO:
      if (own.length > 0) return own;
      return context.autoMayUseTrakwyn ? [AI_PROVIDER_ORDER.TRAKWYN] : [];
  }
}

/** A user's saved keys as provider ids, oldest first, so a substitute is stable from one call to the next. */
export function keyProvidersOldestFirst(
  keys: readonly Pick<LlmApiKey, 'provider' | 'createdAt'>[],
): string[] {
  return [...keys]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((key) => key.provider);
}

/** Trakwyn AI is Pro-only for now (JEF-451), so a user with no key of their own is offered it only on a paid plan and while hosted AI is on for them. */
export function canAutoUseTrakwyn(
  user: Pick<User, 'plan' | 'planExpiresAt'>,
  platformEnabledForUser: boolean,
  now: Date,
): boolean {
  return platformEnabledForUser && effectivePlan(user.plan, user.planExpiresAt, now) !== 'free';
}

function ownKeyChain(settings: AiProviderOrderSettings, keyProviders: readonly string[]): string[] {
  const primary =
    keyProviders.find((provider) => provider === settings.defaultLlmProvider) ?? keyProviders[0];
  if (!primary) return [];
  if (!settings.llmFallbackWhenLimited) return [primary];
  return [primary, ...keyProviders.filter((provider) => provider !== primary)];
}
