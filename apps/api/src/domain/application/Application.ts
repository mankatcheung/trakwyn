import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

export interface Application {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl: string | null;
  location: string | null;
  salaryRange: string | null;
  description: string | null;
  /**
   * The posting as the employer wrote it (JEF-591). `description` is the short
   * summary the lists show; this is what a resume is tailored to, because the
   * summary drops the keywords a screener looks for. Null when never captured.
   */
  postingText: string | null;
  appliedAt: Date | null;
  starred: boolean;
  source: string | null;
  followUpAt: Date | null;
  tags: string[];
  reminderSentAt: Date | null;
  /** Rank within its kanban column, ascending. Scoped to (userId, status). */
  boardPosition: number;
  /** In Trash since; null for a live application. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
