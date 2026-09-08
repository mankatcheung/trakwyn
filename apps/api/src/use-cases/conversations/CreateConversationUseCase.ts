import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { Conversation } from '#src/domain/conversation/Conversation.js';
import { assertValidLlmModelId } from '#src/use-cases/user/llmApiKeyValidation.js';
import type {
  ICreateConversationUseCase,
  CreateConversationInput,
} from '#src/use-cases/conversations/ICreateConversationUseCase.js';

interface Deps {
  conversationRepository: IConversationRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  generateId: () => string;
}

export class CreateConversationUseCase implements ICreateConversationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateConversationInput): Promise<Conversation> {
    // The model is locked in for the conversation and later spliced into a
    // provider URL — same rule as a model saved on a key.
    if (input.model) assertValidLlmModelId(input.model);
    if (input.provider) {
      const key = await this.deps.llmApiKeyRepository.findByUserIdAndProvider(
        input.userId,
        input.provider,
      );
      if (!key) {
        throw new ValidationError('Add an API key for this provider first');
      }
    }

    return this.deps.conversationRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      llmProvider: input.provider ?? null,
      llmModel: input.model ?? null,
    });
  }
}
