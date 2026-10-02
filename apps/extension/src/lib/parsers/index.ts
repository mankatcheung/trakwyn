import {
  JOB_FIELDS,
  type JobData,
  type JobField,
  type ParsedJobPage,
  type ParserName,
} from './types';
import { isLinkedInJobPage, parseLinkedIn } from './linkedin';
import { isIndeedJobPage, parseIndeed } from './indeed';
import { parseGeneric } from './generic';
import { jobBoardOf } from './health';

export type { JobData };

interface SiteParser {
  name: ParserName;
  parse: () => JobData | null;
  /** Whether the URL names one job, so that finding none is a fault. */
  isJobPage: () => boolean;
}

/** The boards with a parser of their own. Every other board gets `generic`. */
const SITE_PARSERS: Partial<Record<string, SiteParser>> = {
  linkedin: { name: 'linkedin', parse: parseLinkedIn, isJobPage: isLinkedInJobPage },
  indeed: { name: 'indeed', parse: parseIndeed, isJobPage: isIndeedJobPage },
};

function missingFields(jobData: JobData | null): JobField[] {
  return JOB_FIELDS.filter((field) => !jobData?.[field]);
}

export function parseJobPage(): ParsedJobPage {
  const board = jobBoardOf(window.location.hostname);
  const siteParser = SITE_PARSERS[board];

  // Site-specific parsers target the standalone job-detail page layout;
  // fall back to the generic JSON-LD JobPosting parser when they come up
  // empty (e.g. LinkedIn/Indeed's search-results split-pane view, or a
  // markup change) rather than reporting no data at all.
  const fromSite = siteParser?.parse() ?? null;
  const jobData = fromSite ?? parseGeneric();
  const parser = fromSite && siteParser ? siteParser.name : jobData ? 'generic' : 'none';

  return {
    jobData,
    parserHealth: {
      board,
      onJobPage: siteParser?.isJobPage() ?? true,
      parser,
      siteParserFailed: siteParser !== undefined && fromSite === null,
      missingFields: missingFields(jobData),
    },
  };
}
