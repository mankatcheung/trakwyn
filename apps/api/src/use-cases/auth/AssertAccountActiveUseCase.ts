import { AccountDeletionScheduledError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
}

/**
 * Refuses a signed-in user whose account is scheduled for deletion (JEF-463):
 * until they cancel it they may do nothing else. Called by the transports
 * (GraphQL, the chat stream, MCP, the CV import) beside
 * `AssertEmailVerifiedUseCase`, so it holds for every client.
 *
 * Confirming a deletion already ends every session and token; this is what
 * stops a fresh sign-in, which still works so the owner can reach "cancel",
 * from doing anything more.
 *
 * A user who no longer exists passes: the resolver that needs the row reports
 * the missing account itself.
 */
export class AssertAccountActiveUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (user?.deletionScheduledAt) {
      throw new AccountDeletionScheduledError();
    }
  }
}
