import { LlmLimitReachedError } from '#src/use-cases/errors/DomainError.js';
import type { LlmApiKey } from '#src/domain/llmApiKey/LlmApiKey.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type {
  ILLMProviderFactory,
  LLMProviderCredentials,
  LLMProviderResolution,
} from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { isLimitReached, startOfUtcMonth } from '#src/use-cases/shared/tokenLimit.js';

interface Deps {
  userLlmProviderFactory: ILLMProviderFactory;
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  llmUsageEventRepository: ILlmUsageEventRepository;
  now: () => Date;
}

/**
 * Refuses a key that has spent its monthly token limit, and — when the user
 * has opted in — stands another of their keys in for it (JEF-258).
 *
 * A decorator over `ILLMProviderFactory` rather than a check inside each AI
 * use case, following the same inner/outer shape as `Cached*Repository` and
 * `BlocklistingSessionRepository`: `resolveForUser` is the one place every
 * real AI feature resolves a provider through, so every call site is covered
 * by construction and no future one has to remember.
 *
 * **`trackUsage: false` is not enforced.** That flag marks a call whose
 * tokens are deliberately not counted — today only `TestLlmApiKeyUseCase`'s
 * "test a saved key" path. A call that does not count toward the limit must
 * not be refused by it, and blocking it would take away the one button that
 * diagnoses the key that is paused. It still spends a few tokens of the
 * user's money (`LLM.TEST_API_KEY_MAX_TOKENS`), which is the deliberate
 * trade.
 *
 * `fromCredentials` is untouched for the same reason and one more: it is for
 * a key that has not been saved yet, so there is no limit to read.
 *
 * The month's usage comes from the primary database, so there is no
 * fail-open decision to make here — if that read fails the request was going
 * to fail anyway. This deliberately does not fail open the way the Redis
 * paths do: a spending limit that stops applying under load is not a limit.
 */
export class LimitEnforcingLLMProviderFactory implements ILLMProviderFactory {
  constructor(private readonly deps: Deps) {}

  async forUser(
    userId: string,
    provider?: string,
    model?: string | null,
    trackUsage = true,
  ): Promise<ILLMProvider | null> {
    const resolution = await this.resolveForUser(userId, provider, model, trackUsage);
    return resolution?.provider ?? null;
  }

  async resolveForUser(
    userId: string,
    provider?: string,
    model?: string | null,
    trackUsage = true,
  ): Promise<LLMProviderResolution | null> {
    if (!trackUsage) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, provider, model, trackUsage);
    }

    // Loaded once here and handed down as hints (F9): the inner factory
    // used to fetch the same user and key again on every call.
    const user = provider ? undefined : await this.deps.userRepository.findById(userId);
    const requested = provider ?? user?.defaultLlmProvider ?? undefined;
    // No provider and no key are the inner factory's cases to report: it
    // returns null and the caller raises AI_NOT_CONFIGURED.
    if (!requested) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, provider, model, trackUsage, {
        user,
      });
    }

    const [usedByProvider, keys] = await Promise.all([
      this.usedTokensByProvider(userId),
      this.deps.llmApiKeyRepository.findAllByUserId(userId),
    ]);
    const requestedKey = keys.find((key) => key.provider === requested) ?? null;

    if (!requestedKey || !this.isPaused(requestedKey, usedByProvider)) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, provider, model, trackUsage, {
        user,
        key: requestedKey,
      });
    }

    const fallbackUser = user ?? (await this.deps.userRepository.findById(userId));
    if (!fallbackUser?.llmFallbackWhenLimited) {
      throw new LlmLimitReachedError(requested, this.nextReset());
    }

    // Oldest key first, so the substitute is stable from one call to the
    // next rather than reshuffling as usage moves around.
    const substitute = keys
      .filter((key) => key.provider !== requested)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .find((key) => !this.isPaused(key, usedByProvider));

    if (!substitute) {
      throw new LlmLimitReachedError(requested, this.nextReset());
    }

    // The substitute's own model, not the caller's — a model name is
    // provider-specific, and passing one across would ask the stand-in for a
    // model it does not have.
    const resolution = await this.deps.userLlmProviderFactory.resolveForUser(
      userId,
      substitute.provider,
      null,
      trackUsage,
      { user: fallbackUser, key: substitute },
    );
    // A key that cannot be built (an unknown provider id, say) is the same as
    // having no substitute at all.
    if (!resolution) throw new LlmLimitReachedError(requested, this.nextReset());

    return { ...resolution, fellBackFrom: requested };
  }

  fromCredentials(credentials: LLMProviderCredentials): ILLMProvider | null {
    return this.deps.userLlmProviderFactory.fromCredentials(credentials);
  }

  private async usedTokensByProvider(userId: string): Promise<Map<string, number>> {
    const summaries = await this.deps.llmUsageEventRepository.summarizeByUserId(
      userId,
      startOfUtcMonth(this.deps.now()),
    );
    return new Map(summaries.map((s) => [s.provider, s.promptTokens + s.completionTokens]));
  }

  private isPaused(key: LlmApiKey, usedByProvider: Map<string, number>): boolean {
    return isLimitReached(usedByProvider.get(key.provider) ?? 0, key.monthlyTokenLimit);
  }

  /** When the allowance refills — the 1st of the following month, UTC. */
  private nextReset(): Date {
    const now = this.deps.now();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
}
