export interface ParsedPostingResult<T> {
  value: T;
  /** True when no `parse` ran for this caller: the value came from an earlier parse. */
  cached: boolean;
}

/**
 * Shares parsed job postings between users (JEF-450). Only ever given the text
 * of a page the server fetched from a public URL, never pasted text, which can
 * hold the user's own notes.
 */
export interface IParsedPostingCache {
  getOrParse<T>(pageText: string, parse: () => Promise<T>): Promise<ParsedPostingResult<T>>;
}
