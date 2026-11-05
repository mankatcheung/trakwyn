import {
  AI_PROVIDER_ORDER,
  AI_SOURCE,
  LLM_USAGE_SOURCE,
  type AiModelTier,
} from '#src/use-cases/constants.js';
import {
  canAutoUseTrakwyn,
  effectiveAiProviderOrder,
  keyProvidersOldestFirst,
} from '#src/use-cases/shared/aiProviderOrder.js';
import { OrderedFallbackLLMProvider } from '#src/infrastructure/llm/OrderedFallbackLLMProvider.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import {
  AiCreditsExhaustedError,
  AiTemporarilyUnavailableError,
  EmailNotVerifiedError,
  LlmLimitReachedError,
  PlanRequiredError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { IAiSpendGuard } from '#src/use-cases/ports/IAiSpendGuard.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { LlmApiKey } from '#src/domain/llmApiKey/LlmApiKey.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type {
  ILLMProviderFactory,
  LLMProviderCredentials,
  LLMProviderRequest,
  LLMProviderResolution,
} from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { AiCreditCharge, IAiCreditService } from '#src/use-cases/ports/IAiCreditService.js';
import { CreditRefundingLLMProvider } from '#src/infrastructure/llm/CreditRefundingLLMProvider.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { isLimitReached, startOfUtcMonth } from '#src/use-cases/shared/tokenLimit.js';

type ReResolve = (tier: AiModelTier) => Promise<LLMProviderResolution | null>;

/**
 * Reasons to try the next entry in the user's order rather than fail: a key at
 * its monthly limit, or the platform refusing for credits, plan, rate or breaker
 * (JEF-503). Anything else, an unverified email above all, is not something
 * another provider fixes, so it stops the call.
 */
function isSkippable(err: unknown): boolean {
  return (
    err instanceof LlmLimitReachedError ||
    err instanceof AiCreditsExhaustedError ||
    err instanceof PlanRequiredError ||
    err instanceof AiTemporarilyUnavailableError ||
    err instanceof RateLimitedError
  );
}

interface Deps {
  userLlmProviderFactory: ILLMProviderFactory;
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  llmUsageEventRepository: ILlmUsageEventRepository;
  now: () => Date;
  /** Optional (JEF-503): a switch to the next provider in the user's order is logged. */
  logger?: ILogger;
  /** Optional (JEF-446): a user on Trakwyn AI has no key to be limited. */
  platformLlmProviderFactory?: IPlatformLLMProviderFactory;
  /** Optional (JEF-447): without it hosted calls are not metered. */
  aiCreditService?: IAiCreditService;
  /** Optional (JEF-449): without it hosted calls are not rate limited per user. */
  hostedAiRateLimiter?: IRateLimiter;
  /** Optional (JEF-449): without it there is no daily spend breaker. */
  aiSpendGuard?: IAiSpendGuard;
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

  async forUser(userId: string, request: LLMProviderRequest): Promise<ILLMProvider | null> {
    const resolution = await this.resolveForUser(userId, request);
    return resolution?.provider ?? null;
  }

  async resolveForUser(
    userId: string,
    request: LLMProviderRequest,
  ): Promise<LLMProviderResolution | null> {
    // A caller that names a key asks for that key, and a key test is always about one key:
    // both keep the single-key path. Everything else walks the user's provider order (JEF-503).
    if (!request.provider && request.trackUsage !== false) {
      return this.resolveOrdered(userId, request);
    }
    const resolution = await this.resolveKey(userId, request);
    return resolution
      ? this.chargeCredits(userId, request, resolution, (tier) =>
          this.resolveKey(userId, { ...request, tier }),
        )
      : null;
  }

  /**
   * Hosted AI credits (JEF-447): charged here, at resolve time, and only when
   * the call runs on the platform's key. A user's own key is never charged,
   * and neither is a key test (`trackUsage: false`).
   */
  private async chargeCredits(
    userId: string,
    request: LLMProviderRequest,
    resolution: LLMProviderResolution,
    reResolve: ReResolve,
  ): Promise<LLMProviderResolution> {
    if (request.trackUsage === false || resolution.source !== LLM_USAGE_SOURCE.PLATFORM) {
      return resolution;
    }
    await this.guardHostedCall(userId);
    const credits = this.deps.aiCreditService;
    if (!credits) return resolution;
    const charge = await credits.charge(userId, request.feature);
    if (!charge) return resolution;
    return this.withCharge(resolution, charge, reResolve);
  }

  /**
   * A Pro user past their credits runs on `lite` whatever the feature would
   * get (JEF-448), so a mid-tier resolution is rebuilt pinned to it. The
   * overflow took no credits, so there is nothing to refund if that fails.
   */
  private async withCharge(
    resolution: LLMProviderResolution,
    charge: AiCreditCharge,
    reResolve: ReResolve,
  ): Promise<LLMProviderResolution> {
    let resolved = resolution;
    if (charge.overflow && resolution.tier !== 'lite') {
      const lite = await reResolve('lite');
      if (lite) resolved = lite;
    }
    return { ...resolved, provider: new CreditRefundingLLMProvider(resolved.provider, charge) };
  }

  /**
   * Guards on spend (JEF-449), in front of the credit charge so a refused
   * call costs the user nothing: a verified email, a per-user rate, and the
   * platform-wide daily breaker, which fails closed.
   */
  private async guardHostedCall(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user?.emailVerifiedAt) {
      throw new EmailNotVerifiedError('Verify your email to use Trakwyn AI.');
    }
    const limiter = this.deps.hostedAiRateLimiter;
    if (limiter && !(await limiter.consume(`hosted-ai:user:${userId}`))) {
      throw new RateLimitedError('Too many Trakwyn AI requests. Wait a minute and try again.');
    }
    await this.deps.aiSpendGuard?.assertWithinBudget();
  }

  /**
   * Resolves through the user's provider order (JEF-503): the first entry that can
   * run answers, and the entries after it stand by for a failure during the call.
   *
   * An entry is skipped, never replaced by one the user did not list, when it
   * cannot run: its key is gone, hosted AI is off for them, the key is paused at its
   * monthly limit, or the platform refuses for credits, plan, rate or breaker. If
   * every entry is skipped the first one's own error is what the user sees, so a
   * single paused key still reads "limit reached" and an empty Trakwyn AI balance
   * still reads "credits exhausted".
   */
  private async resolveOrdered(
    userId: string,
    request: LLMProviderRequest,
  ): Promise<LLMProviderResolution | null> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) return this.deps.userLlmProviderFactory.resolveForUser(userId, request);

    const [keys, usedByProvider] = await Promise.all([
      this.deps.llmApiKeyRepository.findAllByUserId(userId),
      this.usedTokensByProvider(userId),
    ]);
    const platformOn = !!this.deps.platformLlmProviderFactory?.isEnabledFor(userId);
    const keysByProvider = new Map(keys.map((key) => [key.provider, key]));
    const order = effectiveAiProviderOrder(user, keyProvidersOldestFirst(keys), {
      autoMayUseTrakwyn: canAutoUseTrakwyn(user, platformOn, this.deps.now()),
    });
    const candidates = order.filter((entry) =>
      entry === AI_PROVIDER_ORDER.TRAKWYN ? platformOn : keysByProvider.has(entry),
    );

    let index = 0;
    let firstSkipped: string | null = null;
    let firstError: unknown = null;
    const advance = async (): Promise<{
      resolution: LLMProviderResolution;
      entry: string;
    } | null> => {
      while (index < candidates.length) {
        const entry = candidates[index++];
        try {
          const resolution = await this.resolveEntry(userId, request, entry, {
            user,
            key: keysByProvider.get(entry) ?? null,
            usedByProvider,
          });
          if (resolution) return { resolution, entry };
        } catch (err) {
          if (!isSkippable(err)) throw err;
          firstError ??= err;
          firstSkipped ??= entry;
        }
      }
      return null;
    };

    const first = await advance();
    if (!first) {
      if (firstError) throw firstError;
      return null;
    }

    const standingBy = index < candidates.length;
    const provider = standingBy
      ? new OrderedFallbackLLMProvider(
          first.resolution.provider,
          first.entry,
          async () => {
            const next = await advance();
            return next ? { provider: next.resolution.provider, entry: next.entry } : null;
          },
          (from, to, err) =>
            this.deps.logger?.warn('llm.fallback', undefined, {
              from,
              to,
              kind: err.kind,
              status: err.status,
            }),
        )
      : first.resolution.provider;

    return { ...first.resolution, provider, entry: first.entry, fellBackFrom: firstSkipped };
  }

  private async resolveEntry(
    userId: string,
    request: LLMProviderRequest,
    entry: string,
    context: {
      user: NonNullable<Awaited<ReturnType<IUserRepository['findById']>>>;
      key: LlmApiKey | null;
      usedByProvider: Map<string, number>;
    },
  ): Promise<LLMProviderResolution | null> {
    const { user, key, usedByProvider } = context;
    const inner = this.deps.userLlmProviderFactory;

    const resolve = (tier?: AiModelTier) => {
      if (entry === AI_PROVIDER_ORDER.TRAKWYN) {
        return inner.resolveForUser(userId, { ...request, tier }, { user, via: 'platform' });
      }
      // The key's own model, not the caller's: a model name is provider-specific.
      return inner.resolveForUser(
        userId,
        { ...request, provider: entry, model: null, tier },
        { user, key, via: 'key' },
      );
    };

    if (entry !== AI_PROVIDER_ORDER.TRAKWYN && key && this.isPaused(key, usedByProvider)) {
      throw new LlmLimitReachedError(entry, this.nextReset());
    }
    const resolution = await resolve(request.tier);
    // Charged on the resolution's source, whichever entry produced it: only a call that
    // runs on the platform's key costs credits.
    return resolution ? this.chargeCredits(userId, request, resolution, resolve) : null;
  }

  private async resolveKey(
    userId: string,
    request: LLMProviderRequest,
  ): Promise<LLMProviderResolution | null> {
    const { provider, trackUsage = true } = request;
    if (!trackUsage) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, request);
    }

    // Loaded once here and handed down as hints (F9): the inner factory
    // used to fetch the same user and key again on every call.
    const platformOn = !!this.deps.platformLlmProviderFactory?.isEnabledFor(userId);
    const user =
      provider && !platformOn ? undefined : await this.deps.userRepository.findById(userId);

    // On Trakwyn AI there is no key of the user's to refuse; the inner
    // factory resolves the platform path.
    if (platformOn && user?.aiSource === AI_SOURCE.TRAKWYN) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, request, { user });
    }

    const requested = provider ?? user?.defaultLlmProvider ?? undefined;
    // No provider and no key are the inner factory's cases to report: it
    // returns null and the caller raises AI_NOT_CONFIGURED.
    if (!requested) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, request, {
        user,
      });
    }

    const [usedByProvider, keys] = await Promise.all([
      this.usedTokensByProvider(userId),
      this.deps.llmApiKeyRepository.findAllByUserId(userId),
    ]);
    const requestedKey = keys.find((key) => key.provider === requested) ?? null;

    if (!requestedKey || !this.isPaused(requestedKey, usedByProvider)) {
      return this.deps.userLlmProviderFactory.resolveForUser(userId, request, {
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
      { ...request, provider: substitute.provider, model: null },
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
