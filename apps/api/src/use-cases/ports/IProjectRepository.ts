import type { Project } from '#src/domain/project/Project.js';

export type CreateProjectData = Omit<Project, 'createdAt'>;
export type UpdateProjectData = Partial<Omit<Project, 'id' | 'userId' | 'createdAt'>>;

export interface IProjectRepository {
  findAllByUserId(userId: string): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  create(data: CreateProjectData): Promise<Project>;
  update(id: string, data: UpdateProjectData): Promise<Project>;
  delete(id: string, userId: string): Promise<void>;
}
