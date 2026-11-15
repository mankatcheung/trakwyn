import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import type {
  IDeleteCertificationUseCase,
  DeleteCertificationInput,
} from '#src/use-cases/certification/IDeleteCertificationUseCase.js';

interface Deps {
  certificationRepository: ICertificationRepository;
}

export class DeleteCertificationUseCase implements IDeleteCertificationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteCertificationInput): Promise<void> {
    const existing = await this.deps.certificationRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Certification not found');
    }
    await this.deps.certificationRepository.delete(input.id, existing.userId);
  }
}
