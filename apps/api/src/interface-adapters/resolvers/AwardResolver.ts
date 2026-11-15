import type { ICreateAwardUseCase } from '#src/use-cases/award/ICreateAwardUseCase.js';
import type { IUpdateAwardUseCase } from '#src/use-cases/award/IUpdateAwardUseCase.js';
import type { IDeleteAwardUseCase } from '#src/use-cases/award/IDeleteAwardUseCase.js';
import type { IAwardRepository } from '#src/use-cases/ports/IAwardRepository.js';
import type { AwardMapper, AwardDTO } from '#src/interface-adapters/mappers/AwardMapper.js';

interface Deps {
  createAwardUseCase: ICreateAwardUseCase;
  updateAwardUseCase: IUpdateAwardUseCase;
  deleteAwardUseCase: IDeleteAwardUseCase;
  awardRepository: IAwardRepository;
  awardMapper: AwardMapper;
}

interface CreateInput {
  title: string;
  issuer?: string;
  date?: string;
  description?: string;
}

interface UpdateInput {
  title?: string;
  issuer?: string | null;
  date?: string | null;
  description?: string | null;
}

export class AwardResolver {
  constructor(private readonly deps: Deps) {}

  async getAwards(userId: string): Promise<AwardDTO[]> {
    const items = await this.deps.awardRepository.findAllByUserId(userId);
    return items.map((item) => this.deps.awardMapper.toDTO(item));
  }

  async createAward(userId: string, input: CreateInput): Promise<AwardDTO> {
    const result = await this.deps.createAwardUseCase.execute({
      userId,
      title: input.title,
      issuer: input.issuer,
      date: input.date ? new Date(input.date) : null,
      description: input.description,
    });
    return this.deps.awardMapper.toDTO(result);
  }

  async updateAward(userId: string, id: string, input: UpdateInput): Promise<AwardDTO> {
    const result = await this.deps.updateAwardUseCase.execute({
      id,
      userId,
      title: input.title,
      issuer: input.issuer,
      date: input.date === null ? null : input.date ? new Date(input.date) : undefined,
      description: input.description,
    });
    return this.deps.awardMapper.toDTO(result);
  }

  async deleteAward(userId: string, id: string): Promise<void> {
    await this.deps.deleteAwardUseCase.execute({ id, userId });
  }
}
