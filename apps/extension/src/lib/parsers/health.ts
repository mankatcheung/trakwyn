import { JOB_BOARDS, UNKNOWN_JOB_BOARD, type JobBoard } from '../../constants';
import { REQUIRED_JOB_FIELDS, type ParserHealth } from './types';

/**
 * Parser health (JEF-387): the signal that a job board changed its markup.
 * Before it, a parser that stopped matching was visible only to the user
 * looking at an empty popup.
 */

/** The board a hostname belongs to. The hostname itself is never reported. */
export function jobBoardOf(hostname: string): JobBoard {
  const match = JOB_BOARDS.find(
    ({ hostSuffix }) => hostname === hostSuffix || hostname.endsWith(`.${hostSuffix}`),
  );
  return match?.id ?? UNKNOWN_JOB_BOARD;
}

export interface ParserHealthProperties {
  board: JobBoard;
  parser: string;
  site_parser_failed: boolean;
  missing_fields: string[];
}

/**
 * The properties to report a parse with, or `null` when it went well.
 *
 * Reported: a job's page on a known board whose own parser found nothing, or
 * whose result lacks a field a clip needs. Not reported: a healthy parse
 * (that would be usage analytics, which the Clipper does not collect), a
 * page that is not a single job (search results), and unknown boards.
 */
export function parserHealthProperties(health: ParserHealth): ParserHealthProperties | null {
  if (health.board === UNKNOWN_JOB_BOARD || !health.onJobPage) return null;
  const missingRequired = REQUIRED_JOB_FIELDS.some((field) => health.missingFields.includes(field));
  if (!health.siteParserFailed && !missingRequired) return null;
  return {
    board: health.board,
    parser: health.parser,
    site_parser_failed: health.siteParserFailed,
    missing_fields: [...health.missingFields],
  };
}
