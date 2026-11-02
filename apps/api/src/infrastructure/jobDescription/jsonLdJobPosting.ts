import type { StructuredJobPosting } from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import { JOB_POSTING_JSON_LD } from '#src/infrastructure/config/constants.js';
import { htmlToText } from './htmlToText.js';

const JSON_LD_SCRIPT =
  /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function isJobPosting(node: Json): boolean {
  const type = node['@type'];
  return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
}

/** Finds JobPosting nodes in a document, which may be a node, an array, or an `@graph`. */
function collectJobPostings(data: unknown, found: Json[] = []): Json[] {
  if (Array.isArray(data)) {
    for (const item of data) collectJobPostings(item, found);
  } else if (isObject(data)) {
    if (isJobPosting(data)) found.push(data);
    else if (data['@graph']) collectJobPostings(data['@graph'], found);
  }
  return found;
}

function organisationName(node: Json): string | null {
  const org = node['hiringOrganization'] ?? node['employer'];
  const first = Array.isArray(org) ? org[0] : org;
  return isObject(first) ? text(first['name']) : text(first);
}

function locationOf(node: Json): string | null {
  const parts: string[] = [];
  if (text(node['jobLocationType'])?.toUpperCase() === 'TELECOMMUTE') parts.push('Remote');
  const places = [node['jobLocation']].flat();
  for (const place of places) {
    if (!isObject(place)) continue;
    const address = place['address'];
    if (!isObject(address)) {
      const plain = text(address);
      if (plain) parts.push(plain);
      continue;
    }
    const locality = [text(address['addressLocality']), text(address['addressRegion'])]
      .filter((p): p is string => p !== null)
      .join(', ');
    const label = locality || text(address['addressCountry']);
    if (label) parts.push(label);
  }
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

function salaryOf(node: Json): string | null {
  const base = node['baseSalary'];
  if (!isObject(base)) return text(base);
  const currency = text(base['currency']);
  const value = base['value'];
  if (!isObject(value)) {
    const single = text(value);
    return single ? [currency, single].filter(Boolean).join(' ') : null;
  }
  const min = text(value['minValue']);
  const max = text(value['maxValue']);
  const single = text(value['value']);
  const unit = text(value['unitText'])?.toLowerCase();
  const amount = min && max ? `${min}–${max}` : (min ?? max ?? single);
  if (!amount) return null;
  return [currency, amount, unit ? `per ${unit}` : null].filter(Boolean).join(' ');
}

function toPosting(node: Json): StructuredJobPosting {
  const rawDescription = text(node['description']);
  const description = rawDescription
    ? htmlToText(rawDescription).slice(0, JOB_POSTING_JSON_LD.MAX_DESCRIPTION_CHARS) || null
    : null;
  const title = text(node['title']);
  return {
    company: organisationName(node),
    role: title ? htmlToText(title) || null : null,
    location: locationOf(node),
    salary: salaryOf(node),
    description,
  };
}

/**
 * Reads the first `schema.org/JobPosting` out of a page's JSON-LD (JEF-450), the
 * server-side twin of the Clipper's `parseGeneric`. Malformed blocks are
 * skipped. Returns `null` when the page carries none.
 */
export function extractJobPostingJsonLd(html: string): StructuredJobPosting | null {
  for (const match of html.matchAll(JSON_LD_SCRIPT)) {
    try {
      const [node] = collectJobPostings(JSON.parse(match[1] ?? ''));
      if (node) return toPosting(node);
    } catch {
      // A page with one broken block can still have a good one.
    }
  }
  return null;
}
