import { AiNotConfiguredError } from '#src/use-cases/errors/DomainError.js';
import { ENV, LLM_PROVIDER_MODE, PLATFORM_LLM } from '#src/infrastructure/config/constants.js';
import { type AiModelTier } from '#src/use-cases/constants.js';
import { isInHostedAiRollout } from '#src/infrastructure/llm/hostedAiRollout.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { workersAiReasoningFields } from '#src/infrastructure/llm/workersAiReasoning.js';
import type {
  IPlatformLLMProviderFactory,
  PlatformLLMLeg,
} from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';

type Env = Record<string, string | undefined>;

/**
 * Builds the platform's providers from env, read on every call so a missing
 * credential fails on first use rather than at boot (register with `asFunction`).
 *
 * Every hosted call is a Cloudflare Workers AI model reached through AI
 * Gateway's OpenAI-compatible REST route (JEF-453): one Cloudflare API token as
 * the bearer, and `cf-aig-gateway-id` to pick the gateway. There is no Google or
 * OpenAI key and no direct provider call. With `LLM_PROVIDER_MODE=fake` both
 * legs point at this server's own fake completions route and need no
 * credentials.
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
    return PLATFORM_LLM.MODELS[tier].map((model) => this.build(model));
  }

  private build(model: string): PlatformLLMLeg {
    const providerId = PLATFORM_LLM.PROVIDER_ID;
    const reasoningFields = workersAiReasoningFields(model);

    if (this.env[ENV.LLM_PROVIDER_MODE] === LLM_PROVIDER_MODE.FAKE) {
      const port = this.env[ENV.PORT] ?? 3001;
      const provider = new OpenAICompatibleLLMProvider(
        'fake',
        `http://127.0.0.1:${port}${PLATFORM_LLM.FAKE_COMPLETIONS_PATH}`,
        model,
        undefined,
        {},
        reasoningFields,
      );
      return { providerId, model, provider };
    }

    const accountId = this.env[ENV.PLATFORM_CLOUDFLARE_ACCOUNT_ID]?.trim();
    const token = this.env[ENV.PLATFORM_CLOUDFLARE_API_TOKEN]?.trim();
    if (!accountId || !token) throw new AiNotConfiguredError('Hosted AI is not configured');
    const gatewayId =
      this.env[ENV.PLATFORM_CLOUDFLARE_GATEWAY_ID]?.trim() || PLATFORM_LLM.DEFAULT_GATEWAY_ID;

    const provider = new OpenAICompatibleLLMProvider(
      token,
      `${PLATFORM_LLM.REST_BASE}/${encodeURIComponent(accountId)}/${PLATFORM_LLM.REST_PATH}`,
      model,
      undefined,
      { [PLATFORM_LLM.GATEWAY_HEADER]: gatewayId },
      reasoningFields,
    );
    return { providerId, model, provider };
  }
}
