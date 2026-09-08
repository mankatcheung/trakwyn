export const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'interviewing',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl: string | null;
  location: string | null;
  salaryRange: string | null;
  description: string | null;
  appliedAt: string | null;
  starred: boolean;
  source: string | null;
  followUpAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  purgeAt?: string | null;
  /** Rank within its status column on the board, ascending. */
  boardPosition: number;
  likelyGhosted: boolean;
}

export interface CreateApplicationInput {
  company: string;
  role: string;
  status?: ApplicationStatus;
  jobUrl?: string;
  location?: string;
  salaryRange?: string;
  description?: string;
}

export type UpdateApplicationInput = Partial<CreateApplicationInput>;

export interface ApplicationHealthScore {
  score: number;
  label: string;
}

export interface ActivityLog {
  id: string;
  eventType: string;
  payload: string;
  createdAt: string;
}
