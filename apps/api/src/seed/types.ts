import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

export interface SeedNote {
  content: string;
}

export interface SeedContact {
  name: string;
  role: string | null;
  email: string | null;
}

export interface SeedInterviewRound {
  type: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  interviewerName: string | null;
  outcome: string;
}

export interface SeedOffer {
  baseSalary: number;
  bonus: number | null;
  equity: string | null;
  benefits: string | null;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: string;
  notes: string | null;
}

export interface SeedApplication {
  company: string;
  role: string;
  status: ApplicationStatus;
  jobUrl: string | null;
  location: string | null;
  salaryRange: string | null;
  description: string | null;
  appliedAt: Date | null;
  starred: boolean;
  source: string | null;
  tags: string[];
  notes: SeedNote[];
  contacts: SeedContact[];
  interviewRounds: SeedInterviewRound[];
  offers?: SeedOffer[];
}

export interface SeedWorkExperience {
  company: string;
  title: string;
  location: string;
  startDate: Date;
  endDate: Date;
  description: string;
}

export interface SeedEducation {
  institution: string;
  degree: string;
  field: string;
  startDate: Date;
  endDate: Date;
  description: string;
}

export interface SeedSkill {
  name: string;
  category: string;
  proficiency: string;
}

export interface SeedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SeedConversation {
  title: string;
  llmProvider: string;
  llmModel: string;
  messages: SeedMessage[];
}

export type SeedNotificationType = 'interview_reminder' | 'follow_up_reminder' | 'security_alert';

export interface SeedNotification {
  type: SeedNotificationType;
  title: string;
  body: string;
  url: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** A saved Resume Match for a seeded resume. */
export interface SeedResumeMatch {
  score: number;
  label: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
  /** Scored against an earlier version of the resume, so the UI shows it as out of date. */
  stale?: boolean;
}

/**
 * A resume draft. Written to span the ATS-readiness score on purpose: the
 * score is computed from the text when asked, not stored, so what each
 * resume contains is what decides the number a demo user sees.
 */
export interface SeedResume {
  company: string;
  title: string;
  /** The resume as plain text, one line per line. Empty models a draft with nothing in it yet. */
  text: string;
  match?: SeedResumeMatch;
}

export interface SeedCoverLetter {
  company: string;
  title: string;
  text: string;
}
