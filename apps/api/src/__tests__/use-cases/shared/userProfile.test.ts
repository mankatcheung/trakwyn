import { describe, expect, it } from 'vitest';
import { formatProfileMonth, formatUserProfile } from '#src/use-cases/shared/userProfile.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';

describe('formatProfileMonth', () => {
  it('writes a short month and year', () => {
    expect(formatProfileMonth(new Date('2021-03-15T12:00:00Z'))).toBe('Mar 2021');
  });

  it('keeps midnight UTC on the 1st in its month, whatever the process timezone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz;
        expect(formatProfileMonth(new Date('2021-03-01T00:00:00Z'))).toBe('Mar 2021');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('formatUserProfile dates', () => {
  const profile = {
    workExperiences: [
      {
        title: 'Engineer',
        company: 'Lumen Freight',
        startDate: new Date('2021-03-01T00:00:00Z'),
        endDate: null,
        description: null,
      },
      {
        title: 'Intern',
        company: 'Acme',
        startDate: new Date('2020-01-01T00:00:00Z'),
        endDate: new Date('2021-02-28T00:00:00Z'),
        description: null,
      },
    ],
    educations: [
      {
        degree: 'BSc',
        field: 'CS',
        institution: 'State U',
        startDate: new Date('2016-09-01T00:00:00Z'),
        endDate: new Date('2020-06-01T00:00:00Z'),
        description: null,
      },
    ],
    skills: [],
  } as unknown as UserProfile;

  it('uses month and year, and Present for an open end', () => {
    const out = formatUserProfile(profile);
    expect(out).toContain('Engineer at Lumen Freight (Mar 2021 – Present)');
    expect(out).toContain('Intern at Acme (Jan 2020 – Feb 2021)');
    expect(out).toContain('BSc CS at State U (Sep 2016 – Jun 2020)');
    expect(out).not.toMatch(/\d+\/\d+\/\d+/);
  });
});

describe('formatUserProfile descriptions (JEF-590)', () => {
  const job = (
    company: string,
    start: string,
    end: string | null,
    description: string | null,
    location: string | null = null,
  ) => ({
    title: 'Engineer',
    company,
    location,
    startDate: new Date(start),
    endDate: end ? new Date(end) : null,
    description,
  });
  const profileOf = (workExperiences: unknown[], educations: unknown[] = []) =>
    ({ workExperiences, educations, skills: [] }) as unknown as UserProfile;

  it('sends a long description whole, not its first 200 characters', () => {
    const description = `Cut p95 latency from 900 ms to 210 ms. ${'x'.repeat(1400)} Led 4 engineers.`;
    const out = formatUserProfile(profileOf([job('Acme', '2021-03-01', null, description)]));
    expect(out).toContain(description);
  });

  it('keeps each bullet on its own indented line and drops blank ones', () => {
    const out = formatUserProfile(
      profileOf([job('Acme', '2021-03-01', null, '- Shipped billing\n\n  - Mentored 3 juniors ')]),
    );
    expect(out).toContain(
      'Engineer at Acme (Mar 2021 – Present)\n  - Shipped billing\n  - Mentored 3 juniors',
    );
  });

  it('puts the location after the dates, away from the employer name', () => {
    const out = formatUserProfile(
      profileOf([job('Acme', '2021-03-01', null, null, ' Leeds, UK ')]),
    );
    expect(out).toContain('- Engineer at Acme (Mar 2021 – Present; Leeds, UK)');
  });

  it('cuts nothing when no budget is given', () => {
    const descriptions = ['a'.repeat(2000), 'b'.repeat(2000), 'c'.repeat(2000)];
    const out = formatUserProfile(
      profileOf([
        job('One', '2022-01-01', null, descriptions[0]!),
        job('Two', '2019-01-01', '2021-12-01', descriptions[1]!),
        job('Three', '2016-01-01', '2018-12-01', descriptions[2]!),
      ]),
    );
    for (const description of descriptions) expect(out).toContain(description);
  });

  it('spends a budget on the most recent roles and stays inside it', () => {
    // Stored oldest first, to show recency decides and not the list order.
    const profile = profileOf([
      job('Oldest', '2012-01-01', '2015-12-01', 'o'.repeat(600)),
      job('Middle', '2016-01-01', '2019-12-01', 'm'.repeat(600)),
      job('Current', '2020-01-01', null, 'c'.repeat(600)),
    ]);
    const out = formatUserProfile(profile, { maxChars: 1100 });

    expect(out.length).toBeLessThanOrEqual(1100);
    expect(out).toContain('c'.repeat(600));
    // The middle role is cut, and says so; the oldest keeps only its line.
    expect(out).toMatch(/m{40,}…/);
    expect(out).not.toContain('m'.repeat(600));
    expect(out).not.toContain('ooo');
    for (const company of ['Oldest', 'Middle', 'Current']) {
      expect(out).toContain(`Engineer at ${company}`);
    }
    // The list order the user stored is unchanged.
    expect(out.indexOf('Oldest')).toBeLessThan(out.indexOf('Current'));
  });

  it('leaves out a description that would be cut to a few characters', () => {
    const profile = profileOf([
      job('Current', '2020-01-01', null, 'c'.repeat(300)),
      job('Older', '2016-01-01', '2019-12-01', 'o'.repeat(300)),
    ]);
    const fixed = formatUserProfile(
      profileOf([
        job('Current', '2020-01-01', null, null),
        job('Older', '2016-01-01', '2019-12-01', null),
      ]),
    ).length;
    // Room for the current role's text and about twenty characters more.
    const out = formatUserProfile(profile, { maxChars: fixed + 303 + 20 });
    expect(out).toContain('c'.repeat(300));
    expect(out).not.toContain('oo');
    expect(out).not.toContain('…');
  });

  it('gives work experience its detail before education', () => {
    const profile = profileOf(
      [job('Acme', '2020-01-01', null, 'w'.repeat(300))],
      [
        {
          degree: 'BSc',
          field: 'CS',
          institution: 'State U',
          startDate: new Date('2016-09-01'),
          endDate: new Date('2020-06-01'),
          description: 'e'.repeat(300),
        },
      ],
    );
    const out = formatUserProfile(profile, { maxChars: 420 });
    expect(out).toContain('w'.repeat(300));
    expect(out).not.toContain('e'.repeat(300));
    expect(out).toContain('BSc CS at State U');
  });

  it('keeps every role line and skill even when the budget is smaller than they are', () => {
    const profile = {
      workExperiences: [job('Acme', '2020-01-01', null, 'd'.repeat(300))],
      educations: [],
      skills: [{ name: 'TypeScript', category: 'Language', proficiency: null }],
    } as unknown as UserProfile;
    const out = formatUserProfile(profile, { maxChars: 10 });
    expect(out).toContain('Engineer at Acme');
    expect(out).toContain('- Language: TypeScript');
    expect(out).not.toContain('ddd');
  });
});
