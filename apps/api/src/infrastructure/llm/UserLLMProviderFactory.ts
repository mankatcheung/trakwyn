import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import { effectivePlan } from '#src/domain/plan/Plan.js';
import { aiModelTier } from '#src/use-cases/plans/aiModelTier.js';
import {
  AI_SOURCE,
  LLM_USAGE_SOURCE,
  type AiFeature,
  type AiModelTier,
  type LlmUsageSource,
} from '#src/use-cases/constants.js';
import { AiNotConfiguredError } from '#src/use-cases/errors/DomainError.js';
import type { User } from '#src/domain/user/User.js';
import { llmApiKeyCipherContext } from '#src/use-cases/user/llmApiKeyCipherContext.js';
import { UsageTrackingLLMProvider } from '#src/infrastructure/llm/UsageTrackingLLMProvider.js';
import { FailoverLLMProvider } from '#src/infrastructure/llm/FailoverLLMProvider.js';
import { TracingLLMProvider } from '#src/infrastructure/llm/TracingLLMProvider.js';
import { noopMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { IAiSpendGuard } from '#src/use-cases/ports/IAiSpendGuard.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type {
  ILLMProviderFactory,
  LLMProviderCredentials,
  LLMProviderRequest,
  LLMProviderResolution,
  LLMProviderResolveHints,
} from '#src/use-cases/ports/ILLMProviderFactory.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  llmApiKeyCipher: ILlmApiKeyCipher;
  llmUsageEventRepository: ILlmUsageEventRepository;
  outboundUrlPolicy: IOutboundUrlPolicy;
  generateId: () => string;
  logger: ILogger;
  /**
   * Wrap tracked providers in `TracingLLMProvider` (JEF-113). DI passes
   * `isObservabilityEnabled`, so dev and test never build the spans.
   */
  traceLlmCalls?: boolean;
  metrics?: IMetrics;
  /** The platform-owned path (JEF-446). Absent or disabled, every call is the user's own key. */
  platformLlmProviderFactory?: IPlatformLLMProviderFactory;
  /** Optional (JEF-449): platform calls add their cost to the daily spend. */
  aiSpendGuard?: IAiSpendGuard;
  /** For the plan in force when picking a tier (JEF-448); defaults to the clock. */
  now?: () => Date;
}

export class UserLLMProviderFactory implements ILLMProviderFactory {
  constructor(private readonly deps: Deps) {}

  async forUser(userId: string, request: LLMProviderRequest): Promise<ILLMProvider | null> {
    const resolution = await this.resolveForUser(userId, request);
    return resolution?.provider ?? null;
  }

  /**
   * Never falls back — this factory resolves exactly the key it is asked for.
   * `fellBackFrom` is always null here; the limit-enforcing decorator is what
   * can substitute a different key (JEF-258).
   */
  async resolveForUser(
    userId: string,
    request: LLMProviderRequest,
    hints: LLMProviderResolveHints = {},
  ): Promise<LLMProviderResolution | null> {
    const { provider, trackUsage = true } = request;
    const platform = this.deps.platformLlmProviderFactory;
    // Key tests (`trackUsage: false`) are always about the user's own key.
    const platformOn = !!platform?.isEnabledFor(userId) && trackUsage;

    // The caller has already chosen the path from the user's provider order (JEF-503).
    if (hints.via === 'platform') {
      if (!platformOn) return null;
      const platformUser =
        hints.user !== undefined ? hints.user : await this.deps.userRepository.findById(userId);
      return this.resolvePlatform(userId, request, platformUser);
    }
    if (hints.via === 'key') return this.resolveOwn(userId, request, hints, hints.user);

    const user =
      hints.user !== undefined
        ? hints.user
        : provider && !platformOn
          ? undefined
          : await this.deps.userRepository.findById(userId);
    if (platformOn && user?.aiSource === AI_SOURCE.TRAKWYN) {
      return this.resolvePlatform(userId, request, user);
    }

    // `auto` falls to the platform only when the caller named no provider: an
    // explicit one (a chat locked to a key) is a request for that key.
    const own = await this.resolveOwn(userId, request, hints, user);
    if (own || !platformOn || user?.aiSource !== AI_SOURCE.AUTO || provider) return own;
    // Hosted AI is Pro-only for now: a Free user with no key gets the same
    // `AI_NOT_CONFIGURED` as before it existed (JEF-451).
    if (!this.isPaid(user)) return own;
    return this.resolvePlatform(userId, request, user);
  }

  private isPaid(user: User): boolean {
    const now = (this.deps.now ?? (() => new Date()))();
    return effectivePlan(user.plan, user.planExpiresAt, now) !== 'free';
  }

  /** The platform's providers, each with its own tracking, failing over from the first to the second. */
  private resolvePlatform(
    userId: string,
    request: LLMProviderRequest,
    user: User | null | undefined,
  ): LLMProviderResolution {
    const { feature } = request;
    const plan = user
      ? effectivePlan(user.plan, user.planExpiresAt, (this.deps.now ?? (() => new Date()))())
      : 'free';
    const tier: AiModelTier = request.tier ?? aiModelTier(plan, feature);
    const legs = this.deps
      .platformLlmProviderFactory!.legs(tier, { userId, feature })
      .map((leg) => ({
        providerId: leg.providerId,
        provider: this.track(leg.provider, {
          userId,
          feature,
          provider: leg.providerId,
          model: leg.model,
          source: LLM_USAGE_SOURCE.PLATFORM,
          tier,
        }),
      }));
    const [primary, fallback] = legs;
    if (!primary) throw new AiNotConfiguredError('Hosted AI is not configured');
    const provider = fallback
      ? new FailoverLLMProvider(primary.provider, fallback.provider, (err) =>
          this.deps.logger.warn('llm.platform.failover', undefined, {
            from: primary.providerId,
            to: fallback.providerId,
            kind: err.kind,
            status: err.status,
          }),
        )
      : primary.provider;
    return {
      provider,
      providerId: primary.providerId,
      fellBackFrom: null,
      source: LLM_USAGE_SOURCE.PLATFORM,
      tier,
      plan,
    };
  }

  private async resolveOwn(
    userId: string,
    request: LLMProviderRequest,
    hints: LLMProviderResolveHints,
    user: User | null | undefined,
  ): Promise<LLMProviderResolution | null> {
    const { feature, provider, model, trackUsage = true } = request;
    let resolvedProvider = provider;
    if (!resolvedProvider) {
      const loaded = user !== undefined ? user : await this.deps.userRepository.findById(userId);
      resolvedProvider = loaded?.defaultLlmProvider ?? undefined;
    }
    if (!resolvedProvider) return null;

    // A hinted key is only trusted for the provider it was asked for.
    const key =
      hints.key !== undefined && hints.key?.provider === resolvedProvider
        ? hints.key
        : await this.deps.llmApiKeyRepository.findByUserIdAndProvider(userId, resolvedProvider);
    if (!key) return null;

    const entry = PROVIDER_REGISTRY[resolvedProvider];
    if (!entry) return null;

    const apiKey = this.deps.llmApiKeyCipher.decrypt(
      key.apiKey,
      llmApiKeyCipherContext(key.userId, key.provider),
    );
    const resolvedModel = model ?? key.model;
    const rawProvider = entry.create({
      apiKey,
      model: resolvedModel,
      baseUrl: key.baseUrl,
      outboundUrlPolicy: this.deps.outboundUrlPolicy,
    });
    if (!trackUsage) {
      return {
        provider: rawProvider,
        providerId: resolvedProvider,
        fellBackFrom: null,
        source: LLM_USAGE_SOURCE.BYOK,
      };
    }

    const tracked = this.track(rawProvider, {
      userId,
      feature,
      provider: resolvedProvider,
      model: resolvedModel,
      source: LLM_USAGE_SOURCE.BYOK,
    });
    return {
      provider: tracked,
      providerId: resolvedProvider,
      fellBackFrom: null,
      source: LLM_USAGE_SOURCE.BYOK,
    };
  }

  /**
   * Tracing sits beneath usage tracking, so the span times the provider
   * rather than the ledger insert that follows it.
   */
  private track(
    raw: ILLMProvider,
    ctx: {
      userId: string;
      feature: AiFeature;
      provider: string;
      model: string | null;
      source: LlmUsageSource;
      tier?: AiModelTier;
    },
  ): ILLMProvider {
    const measured = this.deps.traceLlmCalls
      ? new TracingLLMProvider({
          inner: raw,
          metrics: this.deps.metrics ?? noopMetrics,
          provider: ctx.provider,
          model: ctx.model,
          tier: ctx.tier,
        })
      : raw;
    return new UsageTrackingLLMProvider({
      inner: measured,
      usageEventRepository: this.deps.llmUsageEventRepository,
      generateId: this.deps.generateId,
      logger: this.deps.logger,
      metrics: this.deps.metrics ?? noopMetrics,
      aiSpendGuard: this.deps.aiSpendGuard,
      ...ctx,
    });
  }

  fromCredentials(credentials: LLMProviderCredentials): ILLMProvider | null {
    const entry = PROVIDER_REGISTRY[credentials.provider];
    if (!entry) return null;

    return entry.create({
      apiKey: credentials.apiKey,
      model: credentials.model ?? null,
      baseUrl: credentials.baseUrl ?? null,
      outboundUrlPolicy: this.deps.outboundUrlPolicy,
    });
  }
}
