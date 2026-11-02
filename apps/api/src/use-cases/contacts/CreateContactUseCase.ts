import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IContactRepository } from '#src/use-cases/ports/IContactRepository.js';
import type {
  ICreateContactUseCase,
  CreateContactInput,
  CreateContactOutput,
} from '#src/use-cases/contacts/ICreateContactUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  contactRepository: IContactRepository;
  generateId: () => string;
}

export class CreateContactUseCase implements ICreateContactUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateContactInput): Promise<CreateContactOutput> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    assertUnderLimit(
      await this.deps.contactRepository.countByApplicationId(input.applicationId),
      CONTENT_LIMITS.CONTACTS_PER_APPLICATION,
      'contacts on this application',
    );

    return this.deps.contactRepository.create({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      name: input.name,
      role: input.role ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      notes: input.notes ?? null,
    });
  }
}
