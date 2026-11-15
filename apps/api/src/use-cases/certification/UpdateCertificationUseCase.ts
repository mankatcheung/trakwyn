import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import {
  optionalText,
  optionalWebUrl,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import type {
  IUpdateCertificationUseCase,
  UpdateCertificationInput,
  UpdateCertificationOutput,
} from '#src/use-cases/certification/IUpdateCertificationUseCase.js';

interface Deps {
  certificationRepository: ICertificationRepository;
}

export class UpdateCertificationUseCase implements IUpdateCertificationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateCertificationInput): Promise<UpdateCertificationOutput> {
    const existing = await this.deps.certificationRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Certification not found');
    }
    return this.deps.certificationRepository.update(input.id, {
      ...(input.name !== undefined ? { name: requiredText(input.name, 'name') } : {}),
      ...(input.issuer !== undefined ? { issuer: optionalText(input.issuer, 'issuer') } : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.credentialUrl !== undefined
        ? { credentialUrl: optionalWebUrl(input.credentialUrl, 'credentialUrl') }
        : {}),
    });
  }
}
