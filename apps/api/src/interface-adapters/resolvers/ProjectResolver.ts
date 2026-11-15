import type { ICreateProjectUseCase } from '#src/use-cases/project/ICreateProjectUseCase.js';
import type { IUpdateProjectUseCase } from '#src/use-cases/project/IUpdateProjectUseCase.js';
import type { IDeleteProjectUseCase } from '#src/use-cases/project/IDeleteProjectUseCase.js';
import type { IProjectRepository } from '#src/use-cases/ports/IProjectRepository.js';
import type { ProjectMapper, ProjectDTO } from '#src/interface-adapters/mappers/ProjectMapper.js';

interface Deps {
  createProjectUseCase: ICreateProjectUseCase;
  updateProjectUseCase: IUpdateProjectUseCase;
  deleteProjectUseCase: IDeleteProjectUseCase;
  projectRepository: IProjectRepository;
  projectMapper: ProjectMapper;
}

interface CreateInput {
  name: string;
  role?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface UpdateInput {
  name?: string;
  role?: string | null;
  url?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

export class ProjectResolver {
  constructor(private readonly deps: Deps) {}

  async getProjects(userId: string): Promise<ProjectDTO[]> {
    const items = await this.deps.projectRepository.findAllByUserId(userId);
    return items.map((item) => this.deps.projectMapper.toDTO(item));
  }

  async createProject(userId: string, input: CreateInput): Promise<ProjectDTO> {
    const result = await this.deps.createProjectUseCase.execute({
      userId,
      name: input.name,
      role: input.role,
      url: input.url,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      description: input.description,
    });
    return this.deps.projectMapper.toDTO(result);
  }

  async updateProject(userId: string, id: string, input: UpdateInput): Promise<ProjectDTO> {
    const result = await this.deps.updateProjectUseCase.execute({
      id,
      userId,
      name: input.name,
      role: input.role,
      url: input.url,
      startDate:
        input.startDate === null ? null : input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate === null ? null : input.endDate ? new Date(input.endDate) : undefined,
      description: input.description,
    });
    return this.deps.projectMapper.toDTO(result);
  }

  async deleteProject(userId: string, id: string): Promise<void> {
    await this.deps.deleteProjectUseCase.execute({ id, userId });
  }
}
