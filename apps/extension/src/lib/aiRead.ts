import { browser } from 'wxt/browser';
import { ApiError, parseJobDescription } from './api';
import { mergeAiResult, type MergedJob } from './parsers/mergeAiResult';
import type { JobData } from './parsers/types';
import { CONTENT_MESSAGES } from '../constants';

export const NO_PAGE_TEXT = "Couldn't read any text from this page.";

/**
 * Reads the tab's posting with the API's AI parser (JEF-420) and merges the
 * answer into the built-in result. Page text goes to the user's own provider
 * through Trakwyn's API and nowhere else; nothing here is reported.
 */
export async function readTabWithAi(
  tabId: number,
  tabUrl: string,
  builtin: JobData | null,
): Promise<MergedJob> {
  const text: string | undefined = await browser.tabs.sendMessage(tabId, {
    type: CONTENT_MESSAGES.GET_PAGE_TEXT,
  });
  if (!text?.trim()) throw new ApiError(NO_PAGE_TEXT);
  const ai = await parseJobDescription(text);
  return mergeAiResult(builtin, ai, { jobUrl: tabUrl, source: new URL(tabUrl).hostname });
}
