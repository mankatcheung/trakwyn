import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import { LLM_PROVIDER } from '#src/use-cases/constants.js';
import { assertValidLlmApiKeyShape } from '#src/use-cases/user/llmApiKeyValidation.js';
import { llmApiKeyCipherContext } from '#src/use-cases/user/llmApiKeyCipherContext.js';
import type {
  ISaveLlmApiKeyUseCase,
  SaveLlmApiKeyInput,
} from '#src/use-cases/user/ISaveLlmApiKeyUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  llmApiKeyCipher: ILlmApiKeyCipher;
  outboundUrlPolicy: IOutboundUrlPolicy;
  generateId: () => string;
}

export class SaveLlmApiKeyUseCase implements ISaveLlmApiKeyUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: SaveLlmApiKeyInput): Promise<void> {
    const isCustom = input.provider === LLM_PROVIDER.CUSTOM;
    const baseUrl = input.baseUrl?.trim() || null;
    const model = input.model?.trim() || null;

    assertValidLlmApiKeyShape({ provider: input.provider, baseUrl, model });

    if (!input.apiKey.trim()) {
      throw new ValidationError('API key is required');
    }
    // Checked here so the settings form hears "no" immediately, and again by
    // the provider on every call, since a hostname can be re-pointed later.
    if (isCustom && baseUrl) {
      await this.deps.outboundUrlPolicy.assertAllowed(baseUrl, 'llm-provider');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    await this.deps.llmApiKeyRepository.upsert({
      id: this.deps.generateId(),
      userId: input.userId,
      provider: input.provider,
      apiKey: this.deps.llmApiKeyCipher.encrypt(
        input.apiKey.trim(),
        llmApiKeyCipherContext(input.userId, input.provider),
      ),
      model,
      baseUrl: isCustom ? baseUrl : null,
    });

    // First key ever configured becomes the default for automatic features —
    // otherwise there'd be no default at all until the user visits settings
    // to pick one, silently disabling cover letters/JD parsing/resume match.
    if (!user.defaultLlmProvider) {
      await this.deps.userRepository.update(input.userId, { defaultLlmProvider: input.provider });
    }
  }
}
