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
   * The primary leg first, then the failover leg when one is configured.
   * Throws `AiNotConfiguredError` when hosted AI is on but the primary key is
   * missing, so a misconfigured deploy fails on first use and not at boot.
   */
  legs(): PlatformLLMLeg[];
}
