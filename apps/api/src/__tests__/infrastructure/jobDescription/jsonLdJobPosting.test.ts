import { describe, it, expect } from 'vitest';
import { extractJobPostingJsonLd } from '#src/infrastructure/jobDescription/jsonLdJobPosting.js';

const page = (...blocks: unknown[]) =>
  `<html><head>${blocks
    // `<` is escaped the way sites do, so markup inside a value cannot end the tag.
    .map(
      (b) =>
        `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`,
    )
    .join('')}</head><body><main>ignored</main></body></html>`;

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Platform Engineer',
  description: '<p>Own the build pipeline &amp; release tooling.</p><ul><li>Go</li></ul>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
  jobLocationType: 'TELECOMMUTE',
  jobLocation: {
    '@type': 'Place',
    address: { addressLocality: 'Berlin', addressRegion: 'BE' },
  },
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'EUR',
    value: { minValue: 70000, maxValue: 90000, unitText: 'YEAR' },
  },
};

describe('extractJobPostingJsonLd', () => {
  it('reads every field from a JobPosting', () => {
    expect(extractJobPostingJsonLd(page(posting))).toEqual({
      role: 'Platform Engineer',
      company: 'Acme Corp',
      location: 'Remote · Berlin, BE',
      salary: 'EUR 70000–90000 per year',
      description: 'Own the build pipeline & release tooling. Go',
    });
  });

  it('finds a posting inside an @graph', () => {
    const result = extractJobPostingJsonLd(
      page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, posting] }),
    );
    expect(result?.role).toBe('Platform Engineer');
  });

  it('finds a posting in an array and when @type is a list', () => {
    const result = extractJobPostingJsonLd(
      page([{ '@type': 'BreadcrumbList' }, { ...posting, '@type': ['JobPosting', 'Thing'] }]),
    );
    expect(result?.company).toBe('Acme Corp');
  });

  it('skips a malformed block and uses a later good one', () => {
    const html = `<script type="application/ld+json">{not json</script>${page(posting)}`;
    expect(extractJobPostingJsonLd(html)?.role).toBe('Platform Engineer');
  });

  it('returns null for a page with no JobPosting', () => {
    expect(extractJobPostingJsonLd(page({ '@type': 'Organization', name: 'Acme' }))).toBeNull();
    expect(extractJobPostingJsonLd('<html><body>plain</body></html>')).toBeNull();
  });

  it('leaves missing fields null', () => {
    expect(extractJobPostingJsonLd(page({ '@type': 'JobPosting', title: 'Dev' }))).toEqual({
      role: 'Dev',
      company: null,
      location: null,
      salary: null,
      description: null,
    });
  });

  it('removes markup from a description that is escaped HTML', () => {
    const result = extractJobPostingJsonLd(
      page({ '@type': 'JobPosting', description: '<script>alert(1)</script><b>Build</b> things' }),
    );
    expect(result?.description).toBe('Build things');
  });

  it('bounds the description length', () => {
    const result = extractJobPostingJsonLd(
      page({ '@type': 'JobPosting', description: 'x'.repeat(5000) }),
    );
    expect(result?.description).toHaveLength(2000);
  });
});
