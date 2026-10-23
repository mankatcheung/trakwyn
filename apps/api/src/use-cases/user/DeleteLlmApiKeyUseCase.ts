import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type {
  IDeleteLlmApiKeyUseCase,
  DeleteLlmApiKeyInput,
} from '#src/use-cases/user/IDeleteLlmApiKeyUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  llmApiKeyRepository: ILlmApiKeyRepository;
  transactionManager?: ITransactionManager;
}

export class DeleteLlmApiKeyUseCase implements IDeleteLlmApiKeyUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteLlmApiKeyInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.llmApiKeyRepository.delete(input.userId, input.provider);

      if (user.defaultLlmProvider === input.provider) {
        await this.deps.userRepository.update(input.userId, { defaultLlmProvider: null });
      }
    });
  }
}
