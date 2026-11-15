import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import {
  optionalText,
  optionalWebUrl,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateCertificationUseCase,
  CreateCertificationInput,
  CreateCertificationOutput,
} from '#src/use-cases/certification/ICreateCertificationUseCase.js';

interface Deps {
  certificationRepository: ICertificationRepository;
  generateId: () => string;
}

export class CreateCertificationUseCase implements ICreateCertificationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateCertificationInput): Promise<CreateCertificationOutput> {
    const existing = await this.deps.certificationRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.CERTIFICATIONS_PER_USER, 'certifications');

    return this.deps.certificationRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: requiredText(input.name, 'name'),
      issuer: optionalText(input.issuer, 'issuer'),
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      credentialUrl: optionalWebUrl(input.credentialUrl, 'credentialUrl'),
    });
  }
}
