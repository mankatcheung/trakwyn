import type { Project } from '#src/domain/project/Project.js';

export interface CreateProjectInput {
  userId: string;
  name: string;
  role?: string | null;
  url?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  description?: string | null;
}
export type CreateProjectOutput = Project;
export interface ICreateProjectUseCase {
  execute(input: CreateProjectInput): Promise<CreateProjectOutput>;
}
