import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { AI_SOURCE, AI_SOURCES } from '#src/use-cases/constants.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import type {
  ISetAiSourceUseCase,
  SetAiSourceInput,
} from '#src/use-cases/user/ISetAiSourceUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  platformLlmProviderFactory: IPlatformLLMProviderFactory;
}

/** Chooses which key the user's AI calls run on (JEF-446). */
export class SetAiSourceUseCase implements ISetAiSourceUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SetAiSourceInput): Promise<void> {
    const aiSource = AI_SOURCES.find((s) => s === input.aiSource);
    if (!aiSource) {
      throw new ValidationError(`AI source must be one of: ${AI_SOURCES.join(', ')}`);
    }
    if (
      aiSource === AI_SOURCE.TRAKWYN &&
      !this.deps.platformLlmProviderFactory.isEnabledFor(input.userId)
    ) {
      throw new ValidationError('Trakwyn AI is not available on this server');
    }
    // A saved order outranks the source; changing the source means the older setting is the one in force.
    await this.deps.userRepository.update(input.userId, { aiSource, aiProviderOrder: null });
  }
}
