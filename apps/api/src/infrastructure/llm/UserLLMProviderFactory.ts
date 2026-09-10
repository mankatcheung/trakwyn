import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import { llmApiKeyCipherContext } from '#src/use-cases/user/llmApiKeyCipherContext.js';
import { UsageTrackingLLMProvider } from '#src/infrastructure/llm/UsageTrackingLLMProvider.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type {
  ILLMProviderFactory,
  LLMProviderCredentials,
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
}

export class UserLLMProviderFactory implements ILLMProviderFactory {
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

  /**
   * Never falls back — this factory resolves exactly the key it is asked for.
   * `fellBackFrom` is always null here; the limit-enforcing decorator is what
   * can substitute a different key (JEF-258).
   */
  async resolveForUser(
    userId: string,
    provider?: string,
    model?: string | null,
    trackUsage = true,
    hints: LLMProviderResolveHints = {},
  ): Promise<LLMProviderResolution | null> {
    let resolvedProvider = provider;
    if (!resolvedProvider) {
      const user =
        hints.user !== undefined ? hints.user : await this.deps.userRepository.findById(userId);
      resolvedProvider = user?.defaultLlmProvider ?? undefined;
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
      return { provider: rawProvider, providerId: resolvedProvider, fellBackFrom: null };
    }

    const tracked = new UsageTrackingLLMProvider({
      inner: rawProvider,
      usageEventRepository: this.deps.llmUsageEventRepository,
      generateId: this.deps.generateId,
      userId,
      provider: resolvedProvider,
      model: resolvedModel,
    });
    return { provider: tracked, providerId: resolvedProvider, fellBackFrom: null };
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
