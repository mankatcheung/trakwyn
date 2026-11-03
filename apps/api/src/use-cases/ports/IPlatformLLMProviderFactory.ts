import type { AiModelTier } from '#src/use-cases/constants.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

/** One provider the platform can call: which, on what model, already built. */
export interface PlatformLLMLeg {
  providerId: string;
  model: string;
  provider: ILLMProvider;
}

/**
 * The platform-owned LLM path (Hosted AI, JEF-446): providers built from keys
 * Trakwyn holds, not the user's. Off unless `HOSTED_AI_ENABLED`, and then
 * `isEnabled()` is false everywhere, so self-hosted, dev and CI are unchanged.
 */
export interface IPlatformLLMProviderFactory {
  isEnabled(): boolean;
  /**
   * Whether this user is inside the staged rollout (JEF-453): on the staff
   * allowlist, or in a stable `userId` bucket below `HOSTED_AI_ROLLOUT_PERCENT`.
   * False whenever `isEnabled()` is. Users outside it behave as if hosted AI
   * did not exist.
   */
  isEnabledFor(userId: string): boolean;
  /**
   * The primary leg first, then the failover leg when one is configured, each
   * on the model of `tier` (JEF-448).
   * Throws `AiNotConfiguredError` when hosted AI is on but the primary key is
   * missing, so a misconfigured deploy fails on first use and not at boot.
   */
  legs(tier: AiModelTier): PlatformLLMLeg[];
}
