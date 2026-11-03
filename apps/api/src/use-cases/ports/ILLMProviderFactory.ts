import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { LlmApiKey } from '#src/domain/llmApiKey/LlmApiKey.js';
import type { User } from '#src/domain/user/User.js';
import type { Plan } from '#src/domain/plan/Plan.js';
import type { AiFeature, AiModelTier, LlmUsageSource } from '#src/use-cases/constants.js';

/**
 * Resolves the LLM provider to use for a given user's own API key —
 * returns null when the user hasn't configured one (AI features are simply
 * unavailable in that case, there is no shared/fallback key).
 *
 * When `provider` is omitted, resolves the user's configured default
 * (`User.defaultLlmProvider`) — used by the automatic AI features (cover
 * letter, JD parsing, resume match). The assistant passes an explicit
 * provider since each conversation picks its own.
 *
 * `model` overrides the model stored on that provider's `LlmApiKey` row —
 * used when a conversation locked in a specific model at creation time.
 */
export interface LLMProviderCredentials {
  provider: string;
  apiKey: string;
  model?: string | null;
  baseUrl?: string | null;
}

/**
 * What `resolveForUser` answers: the provider to call, which of the user's
 * keys it is, and — when the one that would normally have run was paused at
 * its monthly limit — which key it stood in for (JEF-258).
 *
 * `forUser` remains for the callers that only need the provider; this exists
 * for the ones that have to tell the user a different key ran.
 */
export interface LLMProviderResolution {
  provider: ILLMProvider;
  providerId: string;
  /** The paused provider this fell back from, or null on the normal path. */
  fellBackFrom: string | null;
  /** Whose key answers: the user's (`byok`) or Trakwyn's (`platform`, JEF-446). */
  source: LlmUsageSource;
  /** The model tier a platform call runs on (JEF-448); absent on the user's own key. */
  tier?: AiModelTier;
  /** The plan in force for a platform call (JEF-448); absent on the user's own key. */
  plan?: Plan;
}

/**
 * Rows a caller already holds (F9). The limit-enforcing decorator has to
 * load the user and every key to decide whether to refuse; without this
 * the inner factory loaded the same user and key again, four round-trips
 * per AI call. Anything omitted is fetched as before.
 */
export interface LLMProviderResolveHints {
  user?: User | null;
  key?: LlmApiKey | null;
}

/**
 * What a caller says when it asks for a provider (JEF-444). `feature` is
 * required so no call site can spend tokens without saying what for; the
 * rest are optional as before.
 *
 * `trackUsage` (default `true`) gates the `UsageTrackingLLMProvider` wrap
 * (JEF-250) — every real AI feature leaves it at the default; the one
 * caller that passes `false` is `TestLlmApiKeyUseCase`'s "test a saved
 * key" path, which resolves through here too but isn't real usage.
 */
export interface LLMProviderRequest {
  feature: AiFeature;
  provider?: string;
  model?: string | null;
  trackUsage?: boolean;
  /**
   * Pins a platform call to a tier instead of the one the user's plan gets
   * for the feature (JEF-448). Set by the limit-enforcing decorator when a
   * Pro user's overflow is sent to `lite`; ignored on the user's own key.
   */
  tier?: AiModelTier;
}

export interface ILLMProviderFactory {
  /**
   * `forUser`, plus which key was used. Throws the same limit error when no
   * key has headroom, and returns null in the same "not configured" cases.
   */
  resolveForUser(
    userId: string,
    request: LLMProviderRequest,
    hints?: LLMProviderResolveHints,
  ): Promise<LLMProviderResolution | null>;
  forUser(userId: string, request: LLMProviderRequest): Promise<ILLMProvider | null>;
  /**
   * Builds a provider directly from raw, not-yet-persisted credentials —
   * `TestLlmApiKeyUseCase`'s "test before you save" path (JEF-247), which
   * has no `LlmApiKey` row to look up. Synchronous and side-effect-free
   * (no DB access, nothing decrypted): unlike `forUser`, there's nothing
   * stored to read yet. Returns null for an unrecognized `provider` id.
   */
  fromCredentials(credentials: LLMProviderCredentials): ILLMProvider | null;
}
