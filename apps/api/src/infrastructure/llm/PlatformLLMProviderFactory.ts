import { AiNotConfiguredError } from '#src/use-cases/errors/DomainError.js';
import { ENV, LLM_PROVIDER_MODE, PLATFORM_LLM } from '#src/infrastructure/config/constants.js';
import { LLM_PROVIDER, type AiModelTier } from '#src/use-cases/constants.js';
import { isInHostedAiRollout } from '#src/infrastructure/llm/hostedAiRollout.js';
import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import type {
  IPlatformLLMProviderFactory,
  PlatformLLMLeg,
} from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';

type Env = Record<string, string | undefined>;
type PlatformProviderId = keyof typeof PLATFORM_LLM.MODELS;

const KEY_ENV: Record<PlatformProviderId, string> = {
  googleai: ENV.PLATFORM_GOOGLEAI_API_KEY,
  openai: ENV.PLATFORM_OPENAI_API_KEY,
};

function isPlatformProvider(id: string): id is PlatformProviderId {
  return id in PLATFORM_LLM.MODELS;
}

/**
 * Builds the platform's providers from env, read on every call so a missing
 * key fails on first use rather than at boot (register with `asFunction`).
 *
 * With `PLATFORM_LLM_GATEWAY_BASE_URL` set, each provider goes through
 * Cloudflare AI Gateway's per-provider path with `cf-aig-authorization`;
 * unset, it calls the provider directly. With `LLM_PROVIDER_MODE=fake` both
 * legs point at this server's own fake completions route and need no keys.
 */
export class PlatformLLMProviderFactory implements IPlatformLLMProviderFactory {
  constructor(private readonly deps: { env?: Env } = {}) {}

  private get env(): Env {
    return this.deps.env ?? process.env;
  }

  isEnabled(): boolean {
    return this.env[ENV.HOSTED_AI_ENABLED] === 'true';
  }

  isEnabledFor(userId: string): boolean {
    return (
      this.isEnabled() &&
      isInHostedAiRollout(
        userId,
        this.env[ENV.HOSTED_AI_ROLLOUT_PERCENT],
        this.env[ENV.HOSTED_AI_ALLOWLIST],
      )
    );
  }

  legs(tier: AiModelTier): PlatformLLMLeg[] {
    if (!this.isEnabled()) return [];
    const primaryId = this.providerId(ENV.PLATFORM_LLM_PRIMARY, PLATFORM_LLM.DEFAULT_PRIMARY);
    const fallbackId = this.providerId(ENV.PLATFORM_LLM_FALLBACK, PLATFORM_LLM.DEFAULT_FALLBACK);

    const primary = this.build(primaryId, tier, true);
    if (!primary) throw new AiNotConfiguredError('Hosted AI is not configured');
    // A failover leg without its key just means no failover; it never blocks.
    const fallback = fallbackId === primaryId ? null : this.build(fallbackId, tier, false);
    return fallback ? [primary, fallback] : [primary];
  }

  private providerId(envName: string, fallback: string): PlatformProviderId {
    const id = this.env[envName] || fallback;
    if (!isPlatformProvider(id)) {
      throw new AiNotConfiguredError(`Hosted AI provider '${id}' is not supported`);
    }
    return id;
  }

  private build(
    id: PlatformProviderId,
    tier: AiModelTier,
    required: boolean,
  ): PlatformLLMLeg | null {
    const model = PLATFORM_LLM.MODELS[id][tier];

    if (this.env[ENV.LLM_PROVIDER_MODE] === LLM_PROVIDER_MODE.FAKE) {
      const port = this.env[ENV.PORT] ?? 3001;
      const provider = PROVIDER_REGISTRY[LLM_PROVIDER.OPENAI]!.create({
        apiKey: 'fake',
        model,
        baseUrl: null,
        endpointOverride: `http://127.0.0.1:${port}${PLATFORM_LLM.FAKE_COMPLETIONS_PATH}`,
      });
      return { providerId: id, model, provider };
    }

    const apiKey = this.env[KEY_ENV[id]];
    if (!apiKey) {
      if (required) throw new AiNotConfiguredError('Hosted AI is not configured');
      return null;
    }

    const provider = PROVIDER_REGISTRY[id]!.create({
      apiKey,
      model,
      baseUrl: null,
      ...this.gateway(id),
    });
    return { providerId: id, model, provider };
  }

  /** The gateway endpoint and auth header for a provider; empty when no gateway is set. */
  private gateway(id: PlatformProviderId): {
    endpointOverride?: string;
    extraHeaders?: Record<string, string>;
  } {
    const base = this.env[ENV.PLATFORM_LLM_GATEWAY_BASE_URL]?.replace(/\/+$/, '');
    if (!base) return {};
    const root = `${base}/${PLATFORM_LLM.GATEWAY_PATH[id]}`;
    const token = this.env[ENV.PLATFORM_LLM_GATEWAY_TOKEN];
    return {
      endpointOverride: id === 'googleai' ? `${root}/v1beta/models` : `${root}/chat/completions`,
      extraHeaders: token ? { [PLATFORM_LLM.GATEWAY_AUTH_HEADER]: `Bearer ${token}` } : {},
    };
  }
}
