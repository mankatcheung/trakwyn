import { COMPANY_RESEARCH } from '#src/infrastructure/config/constants.js';

function isJobBoard(host: string): boolean {
  return COMPANY_RESEARCH.JOB_BOARD_HOSTS.some(
    (board) => host === board || host.endsWith(`.${board}`),
  );
}

/**
 * The company's own site, taken from the posting link, or `null` when the
 * link says nothing about it (no link, not a web address, or a job board that
 * hosts many companies). `careers.acme.com` and `www.acme.com` both become
 * `https://acme.com`: a hiring subdomain is not where a company describes
 * itself. Only a host comes out of this, never a path or query, so what is
 * fetched afterwards is the root and a fixed list of about pages.
 */
export function companySiteOrigin(jobUrl: string | null): string | null {
  if (!jobUrl?.trim()) return null;

  let url: URL;
  try {
    url = new URL(jobUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || isJobBoard(host)) return null;

  const labels = host.split('.');
  const hiring: readonly string[] = COMPANY_RESEARCH.HIRING_SUBDOMAINS;
  while (labels.length > 2 && hiring.includes(labels[0])) labels.shift();

  return `https://${labels.join('.')}`;
}
