import type { JobData } from './types';

/**
 * LinkedIn now renders job details via a server-driven UI ("SDUI") system
 * whose CSS classes are opaque, per-build hashes (e.g. `_4bbf76d5`) — none
 * of the old semantic classnames survive. `id`/`href`/`data-testid`
 * attributes are still stable, so key off those instead, scoped to a
 * specific job id to avoid matching an unrelated card in a search-results
 * list.
 */
function extractJobId(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('currentJobId');
  if (fromQuery) return fromQuery;

  const fromPath = window.location.pathname.match(/\/jobs\/view\/(\d+)/);
  return fromPath?.[1] ?? null;
}

/**
 * `a[href*="/company/"]` can match more than one anchor for the same
 * company (LinkedIn nests an `<a>` inside another `<a>` around the company
 * logo/name block, which is invalid HTML — the parser's adoption-agency
 * handling of nested anchors closes the outer one early, leaving it with
 * no text while a sibling/inner anchor carries the actual name). Take the
 * first match that actually has text instead of assuming the first match
 * in document order is the right one.
 */
function firstNonEmptyText(container: ParentNode, selector: string): string | undefined {
  for (const el of container.querySelectorAll(selector)) {
    const text = (el as HTMLElement).innerText?.trim();
    if (text) return text;
  }
  return undefined;
}

function parseSdui(jobId: string): JobData | null {
  const aboutJob = document.getElementById(`JobDetails_AboutTheJob_${jobId}`);
  const container = (aboutJob?.closest('[data-testid="lazy-column"]') ?? document) as ParentNode;

  const role = firstNonEmptyText(container, `a[href*="/jobs/view/${jobId}/"]`);
  const company = firstNonEmptyText(container, 'a[href*="/company/"]');

  const description = (
    aboutJob?.querySelector('[data-testid="expandable-text-box"]') as HTMLElement | null
  )?.innerText?.trim();

  if (!role || !company) return null;

  return {
    company,
    role,
    description: description?.slice(0, 2000) || undefined,
    jobUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
    source: 'LinkedIn',
  };
}

/** Legacy semantic-classname selectors, kept as a fallback for markup the SDUI rollout hasn't reached yet. */
function parseLegacy(): JobData | null {
  const company =
    (document.querySelector('.topcard__org-name-link') as HTMLElement)?.innerText?.trim() ||
    (
      document.querySelector(
        '[data-tracking-control-name="public_jobs_topcard-org-name"]',
      ) as HTMLElement
    )?.innerText?.trim() ||
    (
      document.querySelector('.job-details-jobs-unified-top-card__company-name a') as HTMLElement
    )?.innerText?.trim();

  const role =
    (document.querySelector('h1.topcard__title') as HTMLElement)?.innerText?.trim() ||
    (document.querySelector('h1.t-24.t-bold') as HTMLElement)?.innerText?.trim() ||
    (
      document.querySelector('.job-details-jobs-unified-top-card__job-title h1') as HTMLElement
    )?.innerText?.trim();

  const location =
    (document.querySelector('.topcard__flavor--bullet') as HTMLElement)?.innerText?.trim() ||
    (
      document.querySelector(
        '.job-details-jobs-unified-top-card__primary-description-container span',
      ) as HTMLElement
    )?.innerText?.trim();

  const description =
    (document.querySelector('.description__text') as HTMLElement)?.innerText?.trim() ||
    (document.querySelector('#job-details') as HTMLElement)?.innerText?.trim();

  if (!company || !role) return null;

  return {
    company,
    role,
    location: location || undefined,
    description: description?.slice(0, 2000) || undefined,
    jobUrl: window.location.href,
    source: 'LinkedIn',
  };
}

/** A job is open: on its own page, or selected in the search split pane. */
export function isLinkedInJobPage(): boolean {
  return extractJobId() !== null;
}

export function parseLinkedIn(): JobData | null {
  const jobId = extractJobId();
  if (jobId) {
    const viaSdui = parseSdui(jobId);
    if (viaSdui) return viaSdui;
  }

  return parseLegacy();
}
