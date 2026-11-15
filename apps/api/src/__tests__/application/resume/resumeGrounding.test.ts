import { describe, expect, it } from 'vitest';
import { applyProfileFacts, assertGrounded } from '#src/use-cases/resume/resumeGrounding.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';
import {
  makeEducation,
  makeSkill,
  makeWorkExperience,
} from '#src/__tests__/helpers/mocks/profile.js';

const acme = makeWorkExperience({
  id: 'we-1',
  company: 'Acme',
  title: 'Software Engineer',
  startDate: new Date('2021-03-01T00:00:00Z'),
  endDate: null,
  description: 'Ran the Kubernetes platform and wrote Go services.',
});
const globex = makeWorkExperience({
  id: 'we-2',
  company: 'Globex',
  title: 'Junior Developer',
  startDate: new Date('2018-06-01T00:00:00Z'),
  endDate: new Date('2021-02-28T00:00:00Z'),
  description: null,
});
const stateU = makeEducation({
  institution: 'State University',
  degree: 'BSc',
  field: 'Computer Science',
  startDate: new Date('2014-09-01T00:00:00Z'),
  endDate: new Date('2018-06-01T00:00:00Z'),
  description: null,
});

const profileOf = (over: Partial<UserProfile> = {}): UserProfile => ({
  certifications: [],
  languages: [],
  workExperiences: [acme, globex],
  educations: [stateU],
  skills: [
    makeSkill({ id: 's1', name: 'TypeScript', category: 'Languages' }),
    makeSkill({ id: 's2', name: 'PostgreSQL', category: 'Databases' }),
    makeSkill({ id: 's3', name: 'Node.js', category: 'Runtimes' }),
    makeSkill({ id: 's4', name: 'C++', category: 'Languages' }),
  ],
  ...over,
});

const resumeOf = (over: Partial<ResumeContent> = {}): ResumeContent => ({
  summary: 'Engineer.',
  experience: [
    { company: 'Acme', title: 'Software Engineer', period: '2021 – Present', bullets: ['Built'] },
  ],
  education: [{ institution: 'State University', qualification: 'BSc Computer Science' }],
  skills: [{ category: 'Languages', items: ['TypeScript'] }],
  ...over,
});

describe('assertGrounded', () => {
  it('accepts a resume whose employers and schools are all in the profile', () => {
    expect(() => assertGrounded(resumeOf(), profileOf())).not.toThrow();
  });

  it('refuses an employer or a school the user never entered', () => {
    const invented = resumeOf({
      experience: [{ company: 'Google', title: 'Engineer', bullets: [] }],
    });
    expect(() => assertGrounded(invented, profileOf())).toThrow(/have not recorded/);

    const school = resumeOf({ education: [{ institution: 'MIT' }] });
    expect(() => assertGrounded(school, profileOf())).toThrow(/have not recorded/);
  });
});

describe('applyProfileFacts periods (JEF-597)', () => {
  it('writes each role and course period from the stored dates', () => {
    const { resume, corrections } = applyProfileFacts(
      resumeOf({
        experience: [
          { company: 'Acme', title: 'Software Engineer', period: '2020 – 2024', bullets: [] },
          { company: 'Globex', title: 'Junior Developer', bullets: [] },
        ],
        education: [
          { institution: 'State University', qualification: 'BSc', period: '2010 – 2014' },
        ],
      }),
      profileOf(),
    );

    expect(resume.experience.map((e) => e.period)).toEqual([
      'Mar 2021 – Present',
      'Jun 2018 – Feb 2021',
    ]);
    expect(resume.education[0]!.period).toBe('Sep 2014 – Jun 2018');
    expect(corrections.periods).toBe(3);
  });

  it('counts nothing when the model already wrote the stored period', () => {
    const { corrections } = applyProfileFacts(
      resumeOf({
        experience: [
          {
            company: 'Acme',
            title: 'Software Engineer',
            period: 'Mar 2021 – Present',
            bullets: [],
          },
        ],
        education: [{ institution: 'State University', period: 'Sep 2014 – Jun 2018' }],
      }),
      profileOf(),
    );

    expect(corrections).toEqual({ periods: 0, titles: 0, skillsDropped: 0 });
  });

  it('gives two stints at one employer their own dates, matched by title', () => {
    const first = makeWorkExperience({
      id: 'a',
      company: 'Acme',
      title: 'Intern',
      startDate: new Date('2015-06-01T00:00:00Z'),
      endDate: new Date('2015-09-01T00:00:00Z'),
    });
    const second = makeWorkExperience({
      id: 'b',
      company: 'Acme',
      title: 'Engineer',
      startDate: new Date('2019-01-01T00:00:00Z'),
      endDate: null,
    });

    const { resume } = applyProfileFacts(
      resumeOf({
        // Listed newest first, the reverse of how they are stored.
        experience: [
          { company: 'Acme', title: 'Engineer', bullets: [] },
          { company: 'acme', title: 'Intern', bullets: [] },
        ],
      }),
      profileOf({ workExperiences: [first, second] }),
    );

    expect(resume.experience).toEqual([
      { company: 'Acme', title: 'Engineer', period: 'Jan 2019 – Present', bullets: [] },
      { company: 'Acme', title: 'Intern', period: 'Jun 2015 – Sep 2015', bullets: [] },
    ]);
  });

  it('does not hand one row to two entries when titles do not match', () => {
    const first = makeWorkExperience({
      id: 'a',
      company: 'Acme',
      title: 'Intern',
      startDate: new Date('2015-06-01T00:00:00Z'),
      endDate: new Date('2015-09-01T00:00:00Z'),
    });
    const second = makeWorkExperience({
      id: 'b',
      company: 'Acme',
      title: 'Engineer',
      startDate: new Date('2019-01-01T00:00:00Z'),
      endDate: null,
    });

    const { resume } = applyProfileFacts(
      resumeOf({
        experience: [
          { company: 'Acme', title: 'Platform Lead', bullets: [] },
          { company: 'Acme', title: 'Staff Engineer', bullets: [] },
        ],
      }),
      profileOf({ workExperiences: [first, second] }),
    );

    expect(resume.experience.map((e) => e.title)).toEqual(['Intern', 'Engineer']);
  });
});

describe('applyProfileFacts titles (JEF-597)', () => {
  it('puts back a title the model promoted', () => {
    const { resume, corrections } = applyProfileFacts(
      resumeOf({
        experience: [{ company: 'Acme', title: 'Senior Software Engineer', bullets: ['Built'] }],
      }),
      profileOf(),
    );

    expect(resume.experience[0]!.title).toBe('Software Engineer');
    expect(resume.experience[0]!.bullets).toEqual(['Built']);
    expect(corrections.titles).toBe(1);
  });

  it('treats an abbreviation or a change of case as the same title', () => {
    const profile = profileOf({
      workExperiences: [makeWorkExperience({ company: 'Acme', title: 'Sr. Software Eng' })],
    });

    const { resume, corrections } = applyProfileFacts(
      resumeOf({
        experience: [{ company: 'ACME', title: 'senior software engineer', bullets: [] }],
      }),
      profile,
    );

    // Not counted as a correction, and written the way the user stored it.
    expect(corrections.titles).toBe(0);
    expect(resume.experience[0]).toMatchObject({ company: 'Acme', title: 'Sr. Software Eng' });
  });
});

describe('applyProfileFacts skills (JEF-597)', () => {
  const skillsOf = (resume: ResumeContent) => resume.skills.flatMap((group) => group.items);

  it('drops a skill that is only in the posting, and a group left empty', () => {
    const { resume, corrections } = applyProfileFacts(
      resumeOf({
        skills: [
          { category: 'Languages', items: ['TypeScript', 'Rust'] },
          { category: 'Cloud', items: ['Terraform', 'Azure'] },
        ],
      }),
      profileOf(),
    );

    expect(resume.skills).toEqual([{ category: 'Languages', items: ['TypeScript'] }]);
    expect(corrections.skillsDropped).toBe(3);
  });

  it('keeps a skill under another common name, and one with its level attached', () => {
    const { resume, corrections } = applyProfileFacts(
      resumeOf({
        skills: [
          { category: 'Stack', items: ['Postgres', 'NodeJS', 'typescript (advanced)', 'C++'] },
        ],
      }),
      profileOf(),
    );

    expect(skillsOf(resume)).toEqual(['Postgres', 'NodeJS', 'typescript (advanced)', 'C++']);
    expect(corrections.skillsDropped).toBe(0);
  });

  it('does not confuse C with C++, or Java with JavaScript', () => {
    const profile = profileOf({
      workExperiences: [],
      skills: [makeSkill({ id: 'a', name: 'C++' }), makeSkill({ id: 'b', name: 'JavaScript' })],
    });

    const { resume } = applyProfileFacts(
      resumeOf({ experience: [], skills: [{ category: 'Languages', items: ['C', 'Java', 'JS'] }] }),
      profile,
    );

    expect(skillsOf(resume)).toEqual(['JS']);
  });

  it('keeps a skill the user named in a job description but never listed', () => {
    const { resume } = applyProfileFacts(
      resumeOf({ skills: [{ category: 'Platform', items: ['Kubernetes', 'Golang', 'Docker'] }] }),
      profileOf(),
    );

    // "Kubernetes" and "Go" are in Acme's description; Docker is nowhere.
    expect(skillsOf(resume)).toEqual(['Kubernetes', 'Golang']);
  });

  it('leaves no skills section when the profile supports none of them', () => {
    const { resume } = applyProfileFacts(
      resumeOf({ skills: [{ category: 'Cloud', items: ['Azure', ''] }] }),
      profileOf({ skills: [] }),
    );

    expect(resume.skills).toEqual([]);
  });
});

describe('applyProfileFacts', () => {
  it('returns a new resume and leaves the reply untouched', () => {
    const reply = resumeOf({
      experience: [{ company: 'Acme', title: 'Staff Engineer', period: '2020', bullets: [] }],
    });
    const snapshot = structuredClone(reply);

    const { resume } = applyProfileFacts(reply, profileOf());

    expect(reply).toEqual(snapshot);
    expect(resume).not.toBe(reply);
    expect(resume.summary).toBe('Engineer.');
  });
});
