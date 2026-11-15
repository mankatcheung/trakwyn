import type { Project } from '#src/domain/project/Project.js';

export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  role: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  createdAt: string;
}

export class ProjectMapper {
  toDTO(entity: Project): ProjectDTO {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      role: entity.role,
      url: entity.url,
      startDate: entity.startDate?.toISOString() ?? null,
      endDate: entity.endDate?.toISOString() ?? null,
      description: entity.description,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
