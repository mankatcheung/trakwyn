import type { JobData } from './types';
import { DESCRIPTION_MAX_CHARS, POSTING_TEXT_MAX_CHARS } from '../../constants';

/** `/viewjob?jk=…`, or a job selected in the search split pane (`?vjk=…`). */
export function isIndeedJobPage(): boolean {
  const { pathname, search } = window.location;
  return pathname.startsWith('/viewjob') || new URLSearchParams(search).has('vjk');
}

export function parseIndeed(): JobData | null {
  const role =
    (
      document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] span') as HTMLElement
    )?.innerText?.trim() ||
    (
      document.querySelector('h1.jobsearch-JobInfoHeader-title') as HTMLElement
    )?.innerText?.trim() ||
    (document.querySelector('h1[class*="jobsearch"]') as HTMLElement)?.innerText?.trim();

  const company =
    (
      document.querySelector('[data-testid="inlineHeader-companyName"] a') as HTMLElement
    )?.innerText?.trim() ||
    (
      document.querySelector('[data-testid="inlineHeader-companyName"]') as HTMLElement
    )?.innerText?.trim() ||
    (document.querySelector('.jobsearch-InlineCompanyRating a') as HTMLElement)?.innerText?.trim();

  const location =
    (
      document.querySelector('[data-testid="inlineHeader-companyLocation"]') as HTMLElement
    )?.innerText?.trim() ||
    (document.querySelector('[data-testid="job-location"]') as HTMLElement)?.innerText?.trim();

  const description =
    (document.querySelector('#jobDescriptionText') as HTMLElement)?.innerText?.trim() ||
    (document.querySelector('.jobsearch-jobDescriptionText') as HTMLElement)?.innerText?.trim();

  if (!company || !role) return null;

  return {
    company,
    role,
    location: location || undefined,
    description: description?.slice(0, DESCRIPTION_MAX_CHARS) || undefined,
    postingText: description?.slice(0, POSTING_TEXT_MAX_CHARS) || undefined,
    jobUrl: window.location.href,
    source: 'Indeed',
  };
}
