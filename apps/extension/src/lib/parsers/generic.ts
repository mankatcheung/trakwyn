import type { JobData } from './types';
import { DESCRIPTION_MAX_CHARS, POSTING_TEXT_MAX_CHARS } from '../../constants';
import { htmlToPlainText } from './htmlToPlainText';

export function parseGeneric(): JobData | null {
  // Try JSON-LD job posting schema
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      const schema = Array.isArray(data) ? data[0] : data;
      if (schema['@type'] === 'JobPosting') {
        const plainDescription = htmlToPlainText(schema.description as string | undefined);
        return {
          company: schema.hiringOrganization?.name || schema.employer?.name || undefined,
          role: schema.title || document.title,
          location: schema.jobLocation?.address?.addressLocality || undefined,
          description: plainDescription?.slice(0, DESCRIPTION_MAX_CHARS),
          postingText: plainDescription?.slice(0, POSTING_TEXT_MAX_CHARS) || undefined,
          jobUrl: window.location.href,
          source: new URL(window.location.href).hostname,
        };
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  // Fallback: try common selectors
  const role =
    (document.querySelector('h1') as HTMLElement)?.innerText?.trim() ||
    document.title.split(/[-|–|at]/)[0]?.trim();

  const company =
    (
      document.querySelector(
        '[class*="company"], [class*="employer"], [class*="org"]',
      ) as HTMLElement
    )?.innerText?.trim() || document.title.split(/\s+at\s+/i)[1]?.trim();

  if (!role) return null;

  return {
    company: company || new URL(window.location.href).hostname,
    role,
    description: undefined,
    jobUrl: window.location.href,
    source: new URL(window.location.href).hostname,
  };
}
