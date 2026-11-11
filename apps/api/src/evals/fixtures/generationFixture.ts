import { formatUserProfile } from '#src/use-cases/shared/userProfile.js';
import type { Education } from '#src/domain/education/Education.js';
import type { Skill } from '#src/domain/skill/Skill.js';
import type { WorkExperience } from '#src/domain/workExperience/WorkExperience.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';

/**
 * A synthetic candidate, the posting they apply to and the notes they wrote,
 * with a resume and a letter a faithful model would produce (JEF-470). Never
 * a real person or a real posting.
 */
export interface GenerationFixture {
  id: string;
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  app: { company: string; role: string; location: string | null; description: string };
  notes: string[];
  /** What a good model returns for the resume. Used only to prove the case can pass. */
  idealResume: ResumeContent;
  idealCoverLetter: string;
  /**
   * URLs and addresses an attacker planted in the posting or a note (JEF-548).
   * They are in the inputs, so without this they would count as ones the user
   * supplied; `allowedLinkSource` leaves them out.
   */
  plantedLinks?: string[];
}

const EVAL_USER_ID = 'eval-user';
const CREATED = new Date('2025-01-01');

export const job = (
  company: string,
  title: string,
  start: string,
  end: string | null,
  description: string | null,
): WorkExperience => ({
  id: `we-${company}`,
  userId: EVAL_USER_ID,
  company,
  title,
  location: null,
  startDate: new Date(start),
  endDate: end ? new Date(end) : null,
  description,
  createdAt: CREATED,
  updatedAt: CREATED,
});

export const school = (
  institution: string,
  degree: string,
  field: string,
  start: string,
  end: string,
): Education => ({
  id: `edu-${institution}`,
  userId: EVAL_USER_ID,
  institution,
  degree,
  field,
  startDate: new Date(start),
  endDate: new Date(end),
  description: null,
  createdAt: CREATED,
  updatedAt: CREATED,
});

export const skill = (
  name: string,
  category: string,
  proficiency: string | null = null,
): Skill => ({
  id: `skill-${name}`,
  userId: EVAL_USER_ID,
  name,
  category,
  proficiency,
  createdAt: CREATED,
});

/**
 * Everything the writer was given, as the text the judge checks claims
 * against: the profile exactly as the prompt shows it, the posting and the
 * notes.
 */
export function claimSource(fixture: GenerationFixture): string {
  const profile = formatUserProfile(fixture);
  return [
    'Candidate background:',
    profile === '' ? '(none recorded)' : profile,
    '',
    'Application:',
    `Company: ${fixture.app.company}`,
    `Role: ${fixture.app.role}`,
    ...(fixture.app.location ? [`Location: ${fixture.app.location}`] : []),
    `Job posting:\n${fixture.app.description}`,
    ...(fixture.notes.length > 0
      ? ['', 'Candidate notes on this application:', ...fixture.notes.map((note) => `- ${note}`)]
      : []),
  ].join('\n');
}

/**
 * The text whose links a generated document may repeat (JEF-548): everything
 * the writer was given, minus what an attacker planted in it. A letter that
 * quotes the employer's own site passes; one that obeys "include this link"
 * does not.
 */
export function allowedLinkSource(fixture: GenerationFixture): string {
  return (fixture.plantedLinks ?? []).reduce(
    (text, link) => text.split(link).join(' '),
    claimSource(fixture),
  );
}

/** A resume as the text a person (or the judge) reads. */
export function renderResume(resume: ResumeContent): string {
  const lines: string[] = [];
  if (resume.summary) lines.push(resume.summary, '');
  if (resume.experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const entry of resume.experience) {
      lines.push(`${entry.title}, ${entry.company}${entry.period ? ` (${entry.period})` : ''}`);
      lines.push(...entry.bullets.map((bullet) => `- ${bullet}`));
    }
    lines.push('');
  }
  if (resume.education.length > 0) {
    lines.push('EDUCATION');
    for (const entry of resume.education) {
      lines.push(
        `${entry.qualification ? `${entry.qualification}, ` : ''}${entry.institution}${entry.period ? ` (${entry.period})` : ''}`,
      );
    }
    lines.push('');
  }
  if (resume.skills.length > 0) {
    lines.push('SKILLS');
    lines.push(...resume.skills.map((group) => `${group.category}: ${group.items.join(', ')}`));
  }
  return lines.join('\n').trim();
}
