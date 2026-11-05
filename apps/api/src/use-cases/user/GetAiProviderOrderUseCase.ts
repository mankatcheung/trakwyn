import { AI_PROVIDER_ORDER } from '#src/use-cases/constants.js';
import {
  canAutoUseTrakwyn,
  effectiveAiProviderOrder,
  keyProvidersOldestFirst,
} from '#src/use-cases/shared/aiProviderOrder.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import type { IGetAiProviderOrderUseCase } from '#src/use-cases/user/IGetAiProviderOrderUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  platformLlmProviderFactory: IPlatformLLMProviderFactory;
  now: () => Date;
}

/**
 * What a client shows as the user's AI order (JEF-503): the saved list, or the
 * order their older settings mean, minus any entry that could not run today (a
 * deleted key, Trakwyn AI switched off for them). The same order the factories
 * try, so the settings page never promises a provider the call would skip.
 */
export class GetAiProviderOrderUseCase implements IGetAiProviderOrderUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<string[]> {
    const [user, keys] = await Promise.all([
      this.deps.userRepository.findById(userId),
      this.deps.llmApiKeyRepository.findAllByUserId(userId),
    ]);
    if (!user) return [];

    const platformOn = this.deps.platformLlmProviderFactory.isEnabledFor(userId);
    const keyProviders = keyProvidersOldestFirst(keys);
    const order = effectiveAiProviderOrder(user, keyProviders, {
      autoMayUseTrakwyn: canAutoUseTrakwyn(user, platformOn, this.deps.now()),
    });
    return order.filter((entry) =>
      entry === AI_PROVIDER_ORDER.TRAKWYN ? platformOn : keyProviders.includes(entry),
    );
  }
}
