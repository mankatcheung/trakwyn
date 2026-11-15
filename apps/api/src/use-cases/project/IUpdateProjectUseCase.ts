import type { Project } from '#src/domain/project/Project.js';

export interface UpdateProjectInput {
  id: string;
  userId: string;
  name?: string;
  role?: string | null;
  url?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  description?: string | null;
}
export type UpdateProjectOutput = Project;
export interface IUpdateProjectUseCase {
  execute(input: UpdateProjectInput): Promise<UpdateProjectOutput>;
}
