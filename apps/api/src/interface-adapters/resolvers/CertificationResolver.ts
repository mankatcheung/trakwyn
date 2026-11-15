import type { ICreateCertificationUseCase } from '#src/use-cases/certification/ICreateCertificationUseCase.js';
import type { IUpdateCertificationUseCase } from '#src/use-cases/certification/IUpdateCertificationUseCase.js';
import type { IDeleteCertificationUseCase } from '#src/use-cases/certification/IDeleteCertificationUseCase.js';
import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import type {
  CertificationMapper,
  CertificationDTO,
} from '#src/interface-adapters/mappers/CertificationMapper.js';

interface Deps {
  createCertificationUseCase: ICreateCertificationUseCase;
  updateCertificationUseCase: IUpdateCertificationUseCase;
  deleteCertificationUseCase: IDeleteCertificationUseCase;
  certificationRepository: ICertificationRepository;
  certificationMapper: CertificationMapper;
}

interface CreateInput {
  name: string;
  issuer?: string;
  issuedAt?: string;
  expiresAt?: string;
  credentialUrl?: string;
}

interface UpdateInput {
  name?: string;
  issuer?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  credentialUrl?: string | null;
}

export class CertificationResolver {
  constructor(private readonly deps: Deps) {}

  async getCertifications(userId: string): Promise<CertificationDTO[]> {
    const items = await this.deps.certificationRepository.findAllByUserId(userId);
    return items.map((item) => this.deps.certificationMapper.toDTO(item));
  }

  async createCertification(userId: string, input: CreateInput): Promise<CertificationDTO> {
    const result = await this.deps.createCertificationUseCase.execute({
      userId,
      name: input.name,
      issuer: input.issuer,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      credentialUrl: input.credentialUrl,
    });
    return this.deps.certificationMapper.toDTO(result);
  }

  async updateCertification(
    userId: string,
    id: string,
    input: UpdateInput,
  ): Promise<CertificationDTO> {
    const result = await this.deps.updateCertificationUseCase.execute({
      id,
      userId,
      name: input.name,
      issuer: input.issuer,
      issuedAt:
        input.issuedAt === null ? null : input.issuedAt ? new Date(input.issuedAt) : undefined,
      expiresAt:
        input.expiresAt === null ? null : input.expiresAt ? new Date(input.expiresAt) : undefined,
      credentialUrl: input.credentialUrl,
    });
    return this.deps.certificationMapper.toDTO(result);
  }

  async deleteCertification(userId: string, id: string): Promise<void> {
    await this.deps.deleteCertificationUseCase.execute({ id, userId });
  }
}
