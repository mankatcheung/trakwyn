import { AI_PROVIDER_ORDER } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import type {
  ISetAiProviderOrderUseCase,
  SetAiProviderOrderInput,
} from '#src/use-cases/user/ISetAiProviderOrderUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  platformLlmProviderFactory: IPlatformLLMProviderFactory;
}

/**
 * Saves the providers a user's AI calls try, in order (JEF-503). The list is the
 * whole policy: a call never runs on a provider that is not in it, so every entry
 * must be able to run now, and a user cannot be sent to a vendor they did not
 * pick by a list that names one they have no key for.
 */
export class SetAiProviderOrderUseCase implements ISetAiProviderOrderUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SetAiProviderOrderInput): Promise<void> {
    const { order } = input;
    if (order.length === 0) {
      throw new ValidationError('Choose at least one AI provider');
    }
    if (new Set(order).size !== order.length) {
      throw new ValidationError('Each AI provider can be listed only once');
    }

    const keys = await this.deps.llmApiKeyRepository.findAllByUserId(input.userId);
    const keyProviders = new Set(keys.map((key) => key.provider));

    for (const entry of order) {
      if (entry === AI_PROVIDER_ORDER.TRAKWYN) {
        if (!this.deps.platformLlmProviderFactory.isEnabledFor(input.userId)) {
          throw new ValidationError('Trakwyn AI is not available on this server');
        }
      } else if (!keyProviders.has(entry)) {
        throw new ValidationError(`Add an API key for ${entry} before listing it`);
      }
    }

    await this.deps.userRepository.update(input.userId, { aiProviderOrder: order });
  }
}
