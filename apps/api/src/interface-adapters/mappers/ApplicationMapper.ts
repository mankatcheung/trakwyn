import type { Application } from '#src/domain/application/Application.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import { isLikelyGhosted } from '#src/use-cases/jobs/applicationStaleness.js';

export interface ApplicationDTO {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl: string | null;
  location: string | null;
  salaryRange: string | null;
  description: string | null;
  postingText: string | null;
  appliedAt: string | null;
  starred: boolean;
  source: string | null;
  followUpAt: string | null;
  tags: string[];
  /** Rank within its kanban column, ascending. */
  boardPosition: number;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp while in Trash; null when live. */
  deletedAt: string | null;
  likelyGhosted: boolean;
}

export interface ApplicationConnectionDTO {
  items: ApplicationDTO[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export class ApplicationMapper {
  toDTO(app: Application): ApplicationDTO {
    return {
      id: app.id,
      userId: app.userId,
      company: app.company,
      role: app.role,
      status: app.status,
      jobUrl: app.jobUrl,
      location: app.location,
      salaryRange: app.salaryRange,
      description: app.description,
      postingText: app.postingText,
      appliedAt: app.appliedAt?.toISOString() ?? null,
      starred: app.starred,
      source: app.source,
      followUpAt: app.followUpAt?.toISOString() ?? null,
      tags: app.tags,
      boardPosition: app.boardPosition,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      deletedAt: app.deletedAt?.toISOString() ?? null,
      likelyGhosted: isLikelyGhosted(app),
    };
  }
}
