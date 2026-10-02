import type { JobBoard } from '../../constants';

export interface JobData {
  company: string;
  role: string;
  location?: string;
  description?: string;
  jobUrl: string;
  source?: string;
}

/** Which parser produced the result; `none` when every one came up empty. */
export type ParserName = 'linkedin' | 'indeed' | 'generic' | 'none';

/**
 * How the parsers fared on a page (JEF-387). Field names and fixed
 * identifiers only: nothing here is read from the page.
 */
export interface ParserHealth {
  board: JobBoard;
  parser: ParserName;
  /** The board has its own parser and it found no job, so `generic` ran instead. */
  siteParserFailed: boolean;
  missingFields: JobField[];
}

export type JobField = (typeof JOB_FIELDS)[number];

/** The fields a clip is judged on. `company` and `role` are required to save one. */
export const JOB_FIELDS = ['company', 'role', 'description'] as const;
export const REQUIRED_JOB_FIELDS: readonly JobField[] = ['company', 'role'];

/** What the content script answers the popup with. */
export interface ParsedJobPage {
  jobData: JobData | null;
  parserHealth: ParserHealth;
}
