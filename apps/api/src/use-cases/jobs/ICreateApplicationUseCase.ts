import type { Application } from '#src/domain/application/Application.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

export interface CreateApplicationInput {
  userId: string;
  company: string;
  role: string;
  status?: ApplicationStatus;
  jobUrl?: string;
  location?: string;
  salaryRange?: string;
  description?: string;
  /** The full posting text (JEF-591), at most `FIELD_LENGTH_LIMITS.POSTING_TEXT`. */
  postingText?: string;
  starred?: boolean;
  source?: string;
  followUpAt?: Date | null;
  tags?: string[];
}

export type CreateApplicationOutput = Application;

export interface ICreateApplicationUseCase {
  execute(input: CreateApplicationInput): Promise<CreateApplicationOutput>;
}
