import { EmailNotVerifiedError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
}

/**
 * Refuses a signed-in user whose email address is not verified (JEF-438).
 * Called by the transports (GraphQL, the chat stream, MCP) before they do any
 * work for the user, so the verification wall holds for every client and not
 * just the web app's full-page reminder.
 *
 * A user who no longer exists passes: the resolver that needs the row reports
 * the missing account itself.
 */
export class AssertEmailVerifiedUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (user && !user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }
  }
}
