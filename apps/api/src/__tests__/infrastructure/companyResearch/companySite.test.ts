import { describe, it, expect } from 'vitest';
import { companySiteOrigin } from '#src/infrastructure/companyResearch/companySite.js';

describe('companySiteOrigin', () => {
  it.each([
    ['https://acme.com/careers/senior-engineer?gh_jid=123', 'https://acme.com'],
    ['http://acme.com/jobs/1', 'https://acme.com'],
    ['https://careers.acme.com/jobs/1', 'https://acme.com'],
    ['https://jobs.acme.com/x', 'https://acme.com'],
    ['https://www.acme.com/careers', 'https://acme.com'],
    ['https://careers.www.acme.com/x', 'https://acme.com'],
    ['https://careers.acme.co.uk/x', 'https://acme.co.uk'],
    ['https://ACME.com/Jobs', 'https://acme.com'],
    ['https://eu.acme.com/careers', 'https://eu.acme.com'],
  ])('derives the company site from %s', (jobUrl, expected) => {
    expect(companySiteOrigin(jobUrl)).toBe(expected);
  });

  it('keeps only the host: no path, query, port or credentials of the posting link', () => {
    expect(companySiteOrigin('https://acme.com:8443/x?token=secret#frag')).toBe('https://acme.com');
  });

  it.each([
    'https://www.linkedin.com/jobs/view/123',
    'https://boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/acme/abc',
    'https://acme.wd1.myworkdayjobs.com/en-US/External/job/1',
    'https://uk.indeed.com/viewjob?jk=1',
  ])('returns null for a job board: %s', (jobUrl) => {
    expect(companySiteOrigin(jobUrl)).toBeNull();
  });

  it('does not treat a lookalike of a job board as one', () => {
    expect(companySiteOrigin('https://notlinkedin.com/jobs/1')).toBe('https://notlinkedin.com');
  });

  it.each([
    null,
    '',
    '   ',
    'not a url',
    'ftp://acme.com/jobs',
    'javascript:alert(1)',
    'https://localhost/x',
  ])('returns null when the link names no company site: %s', (jobUrl) => {
    expect(companySiteOrigin(jobUrl)).toBeNull();
  });
});
