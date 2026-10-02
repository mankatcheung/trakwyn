import {
  JOB_FIELDS,
  type JobData,
  type JobField,
  type ParsedJobPage,
  type ParserName,
} from './types';
import { parseLinkedIn } from './linkedin';
import { parseIndeed } from './indeed';
import { parseGeneric } from './generic';
import { jobBoardOf } from './health';

export type { JobData };

/** The boards with a parser of their own. Every other board gets `generic`. */
const SITE_PARSERS: Partial<Record<string, { name: ParserName; parse: () => JobData | null }>> = {
  linkedin: { name: 'linkedin', parse: parseLinkedIn },
  indeed: { name: 'indeed', parse: parseIndeed },
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
      parser,
      siteParserFailed: siteParser !== undefined && fromSite === null,
      missingFields: missingFields(jobData),
    },
  };
}
