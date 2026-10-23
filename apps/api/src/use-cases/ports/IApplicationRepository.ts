import type { Application } from '#src/domain/application/Application.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

export interface ApplicationTagData {
  id: string;
  name: string;
}

export interface CreateApplicationData {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  description?: string | null;
  starred?: boolean;
  source?: string | null;
  followUpAt?: Date | null;
  tags?: ApplicationTagData[];
  /**
   * The most applications the owner may have, from their entitlements; `null`
   * for no cap. Passed in because the repository reserves the slot in one
   * conditional `UPDATE`, which is what keeps simultaneous creates from both
   * passing the limit.
   */
  applicationLimit: number | null;
}

export interface UpdateApplicationData {
  company?: string;
  role?: string;
  status?: ApplicationStatus;
  jobUrl?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  description?: string | null;
  appliedAt?: Date | null;
  starred?: boolean;
  source?: string | null;
  followUpAt?: Date | null;
  tags?: ApplicationTagData[];
  boardPosition?: number;
}

export interface FindApplicationsPageFilters {
  status?: ApplicationStatus;
  starred?: boolean;
  search?: string;
  likelyGhosted?: boolean;
}

export interface FindApplicationsPagePagination {
  cursor?: string;
  limit: number;
}

export interface ApplicationsPage {
  items: Application[];
  hasNextPage: boolean;
}

export interface IApplicationRepository {
  findAllByUserId(userId: string, filters?: { status?: ApplicationStatus }): Promise<Application[]>;
  findPageByUserId(
    userId: string,
    filters: FindApplicationsPageFilters,
    pagination: FindApplicationsPagePagination,
  ): Promise<ApplicationsPage>;
  /** Live applications only — a trashed one reads as missing. */
  findById(id: string): Promise<Application | null>;
  /** The deliberate exception: the detail query and the Trash operations. */
  findByIdIncludingTrashed(id: string): Promise<Application | null>;
  findTrashedByUserId(userId: string): Promise<Application[]>;
  findDueForPurge(deletedBefore: Date): Promise<Application[]>;
  softDelete(id: string, deletedAt: Date): Promise<void>;
  restore(id: string): Promise<void>;
  /**
   * Renumber one kanban column to exactly `orderedIds`, writing 0…n-1, and
   * return the column as it now reads.
   *
   * Scoped to the user's live applications in `status`: an id belonging to
   * someone else, to another column, or to a trashed application matches no
   * row and is silently ignored. The use case rejects those cases up front so
   * the caller gets a real error — this scoping is the second lock, not the
   * first.
   */
  reorderBoard(
    userId: string,
    status: ApplicationStatus,
    orderedIds: string[],
  ): Promise<Application[]>;
  create(data: CreateApplicationData): Promise<Application>;
  update(id: string, data: UpdateApplicationData): Promise<Application>;
  delete(id: string): Promise<void>;
  findDueForReminder(): Promise<Application[]>;
  updateReminderSentAt(id: string, sentAt: Date): Promise<void>;
}
