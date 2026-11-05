import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type {
  ISetDefaultLlmProviderUseCase,
  SetDefaultLlmProviderInput,
} from '#src/use-cases/user/ISetDefaultLlmProviderUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
}

export class SetDefaultLlmProviderUseCase implements ISetDefaultLlmProviderUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SetDefaultLlmProviderInput): Promise<void> {
    const key = await this.deps.llmApiKeyRepository.findByUserIdAndProvider(
      input.userId,
      input.provider,
    );
    if (!key) {
      throw new ValidationError('Add an API key for this provider before making it the default');
    }

    // A saved order outranks the default; changing the default means the older setting is the one in force.
    await this.deps.userRepository.update(input.userId, {
      defaultLlmProvider: input.provider,
      aiProviderOrder: null,
    });
  }
}
