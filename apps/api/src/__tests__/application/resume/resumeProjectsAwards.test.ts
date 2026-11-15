import { describe, expect, it } from 'vitest';
import { applyProfileFacts, assertGrounded } from '#src/use-cases/resume/resumeGrounding.js';
import { resumeToTiptapDoc } from '#src/use-cases/shared/resumeToTiptapDoc.js';
import {
  formatUserProfile,
  isUserProfileEmpty,
  type UserProfile,
} from '#src/use-cases/shared/userProfile.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import {
  makeAward,
  makeProject,
  makeWorkExperience,
} from '#src/__tests__/helpers/mocks/profile.js';

const cli = makeProject({
  name: 'Open-source CLI',
  role: 'Maintainer',
  startDate: new Date('2021-03-01T00:00:00Z'),
  endDate: null,
});
const excellence = makeAward({
  title: 'Engineering Excellence Award',
  issuer: 'Acme',
  date: new Date('2022-06-01T00:00:00Z'),
});

const profileOf = (over: Partial<UserProfile> = {}): UserProfile => ({
  workExperiences: [makeWorkExperience({ company: 'Acme', title: 'Engineer' })],
  educations: [],
  skills: [],
  certifications: [],
  languages: [],
  projects: [cli],
  awards: [excellence],
  ...over,
});

const resumeOf = (over: Partial<ResumeContent> = {}): ResumeContent => ({
  summary: 'Engineer.',
  experience: [{ company: 'Acme', title: 'Engineer', bullets: [] }],
  education: [],
  skills: [],
  ...over,
});

describe('projects and awards in a generated resume (JEF-592)', () => {
  it('refuses a project or an award the profile does not hold', () => {
    expect(() =>
      assertGrounded(
        resumeOf({ projects: [{ name: 'Secret startup', bullets: [] }] }),
        profileOf(),
      ),
    ).toThrow(/have not recorded/);
    expect(() =>
      assertGrounded(resumeOf({ awards: [{ title: 'Nobel Prize' }] }), profileOf()),
    ).toThrow(/have not recorded/);
  });

  it('accepts entries the profile holds, however they are capitalised', () => {
    expect(() =>
      assertGrounded(
        resumeOf({
          projects: [{ name: 'open-source cli', bullets: [] }],
          awards: [{ title: ' ENGINEERING EXCELLENCE AWARD ' }],
        }),
        profileOf(),
      ),
    ).not.toThrow();
  });

  it('takes name, role, period, issuer and date from the profile and keeps the bullets', () => {
    const { resume } = applyProfileFacts(
      resumeOf({
        projects: [
          {
            name: 'open-source cli',
            role: 'Founder',
            period: '1999',
            bullets: ['Maintained a CLI used by 2,000 developers'],
          },
        ],
        awards: [{ title: 'engineering excellence award', issuer: 'Google', date: '2030' }],
      }),
      profileOf(),
    );
    expect(resume.projects).toEqual([
      {
        name: 'Open-source CLI',
        role: 'Maintainer',
        period: 'Mar 2021 – Present',
        bullets: ['Maintained a CLI used by 2,000 developers'],
      },
    ]);
    expect(resume.awards).toEqual([
      { title: 'Engineering Excellence Award', issuer: 'Acme', date: 'Jun 2022' },
    ]);
  });

  it('lists an entry once and gives nothing when the model chose none', () => {
    const twice = applyProfileFacts(
      resumeOf({
        projects: [
          { name: 'Open-source CLI', bullets: [] },
          { name: 'open-source cli', bullets: [] },
        ],
      }),
      profileOf(),
    );
    expect(twice.resume.projects).toHaveLength(1);
    expect(applyProfileFacts(resumeOf(), profileOf()).resume.awards).toEqual([]);
  });

  it('renders Projects after Experience and Awards before Languages', () => {
    const { plainText } = resumeToTiptapDoc(
      resumeOf({
        projects: [
          {
            name: 'CLI',
            role: 'Maintainer',
            period: 'Mar 2021 – Present',
            bullets: ['Shipped v2'],
          },
        ],
        awards: [{ title: 'Excellence', issuer: 'Acme', date: 'Jun 2022' }],
        languages: [{ name: 'French' }],
      }),
    );
    expect(plainText).toContain('Projects\nCLI — Maintainer (Mar 2021 – Present)\n- Shipped v2');
    expect(plainText).toContain('Awards\nExcellence — Acme — Jun 2022');
    expect(plainText.indexOf('Experience')).toBeLessThan(plainText.indexOf('Projects'));
    expect(plainText.indexOf('Awards')).toBeLessThan(plainText.indexOf('Languages'));
  });
});

describe('the profile text with projects and awards (JEF-592)', () => {
  it('lists them with role, dates and description', () => {
    const text = formatUserProfile(profileOf());
    expect(text).toContain(
      'Projects:\n- Open-source CLI (Maintainer; Mar 2021 – Present)\n  Maintained a CLI used by 2,000 developers.',
    );
    expect(text).toContain('Awards:\n- Engineering Excellence Award (Acme, Jun 2022)');
  });

  it('is not empty when they are all the user has entered', () => {
    expect(isUserProfileEmpty(profileOf({ workExperiences: [] }))).toBe(false);
    expect(isUserProfileEmpty(profileOf({ workExperiences: [], projects: [], awards: [] }))).toBe(
      true,
    );
  });
});
