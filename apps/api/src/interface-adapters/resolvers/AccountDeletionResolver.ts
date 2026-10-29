import type {
  RequestAccountDeletionInput,
  RequestAccountDeletionUseCase,
} from '#src/use-cases/user/RequestAccountDeletionUseCase.js';
import type { ConfirmAccountDeletionUseCase } from '#src/use-cases/user/ConfirmAccountDeletionUseCase.js';
import type {
  CancelAccountDeletionInput,
  CancelAccountDeletionUseCase,
} from '#src/use-cases/user/CancelAccountDeletionUseCase.js';

interface Deps {
  requestAccountDeletionUseCase: Pick<RequestAccountDeletionUseCase, 'execute'>;
  confirmAccountDeletionUseCase: Pick<ConfirmAccountDeletionUseCase, 'execute'>;
  cancelAccountDeletionUseCase: Pick<CancelAccountDeletionUseCase, 'execute'>;
}

/** Deleting an account (JEF-463): request (mails a link), confirm (the link), cancel. */
export class AccountDeletionResolver {
  constructor(private readonly deps: Deps) {}

  async request(input: RequestAccountDeletionInput): Promise<void> {
    await this.deps.requestAccountDeletionUseCase.execute(input);
  }

  /** Schedules the deletion and returns when it will happen. */
  async confirm(token: string): Promise<Date> {
    const { deletionScheduledAt } = await this.deps.confirmAccountDeletionUseCase.execute({
      token,
    });
    return deletionScheduledAt;
  }

  async cancel(input: CancelAccountDeletionInput): Promise<void> {
    await this.deps.cancelAccountDeletionUseCase.execute(input);
  }
}
