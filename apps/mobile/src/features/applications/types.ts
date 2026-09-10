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

export type UpdateApplicationInput = Partial<CreateApplicationInput> & {
  starred?: boolean;
  tags?: string[];
  followUpAt?: string | null;
};

export interface HealthScoreCriterion {
  key: string;
  label: string;
  points: number;
  earned: number;
  met: boolean;
}

export interface ApplicationHealthScore {
  score: number;
  label: string;
  criteria: HealthScoreCriterion[];
}

export interface ActivityLog {
  id: string;
  eventType: string;
  payload: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  applicationId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
}

export interface ResumeMatchScoreResult {
  score: number;
  label: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
}

export interface CompanyBriefing {
  id: string;
  applicationId: string;
  content: string;
  generatedAt: string;
}
