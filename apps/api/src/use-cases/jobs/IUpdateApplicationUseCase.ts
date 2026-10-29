import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import type { Application } from '#src/domain/application/Application.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

export interface UpdateApplicationInput {
  userId: string;
  applicationId: string;
  company?: string;
  role?: string;
  status?: ApplicationStatus;
  jobUrl?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  description?: string | null;
  starred?: boolean;
  source?: string | null;
  followUpAt?: Date | null;
  tags?: string[];
  /** Set when an MCP client made the change; recorded in the activity log. */
  actor?: McpActor;
}

export type UpdateApplicationOutput = Application;

export interface IUpdateApplicationUseCase {
  execute(input: UpdateApplicationInput): Promise<UpdateApplicationOutput>;
}
