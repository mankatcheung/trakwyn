import type {
  ResumeContent,
  ResumeCertificationEntry,
  ResumeEducationEntry,
  ResumeLanguageEntry,
  ResumeExperienceEntry,
  ResumeSkillGroup,
} from '#src/domain/resume/ResumeContent.js';
import type { Education } from '#src/domain/education/Education.js';
import type { WorkExperience } from '#src/domain/workExperience/WorkExperience.js';
import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import { formatProfileMonth, type UserProfile } from '#src/use-cases/shared/userProfile.js';

/*
 * What stands between a model's reply and a resume the user may send.
 *
 * A resume asserts facts about someone's history, so the facts that are
 * stored are not left to the model: an employer or school the user never
 * entered refuses the whole reply (`assertGrounded`), and the dates, job
 * titles and skills are taken from or checked against the profile
 * (`applyProfileFacts`, JEF-597). Bullet text is the model's wording and is
 * not checked here; the eval judge covers it.
 */

/** Compared loosely: rewording is allowed, inventing is not. */
const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Every employer and institution in the output must be one the user entered.
 *
 * A model that adds a job is not producing a worse draft, it is producing a
 * document that is harmful to send — so this refuses rather than filtering the
 * invented entries out, which would hand back a plausible resume with no sign
 * anything had gone wrong.
 */
export function assertGrounded(resume: ResumeContent, profile: UserProfile): void {
  const companies = new Set(profile.workExperiences.map((w) => normalize(w.company)));
  const institutions = new Set(profile.educations.map((e) => normalize(e.institution)));

  const inventedEmployer = resume.experience.find((e) => !companies.has(normalize(e.company)));
  const inventedSchool = resume.education.find((e) => !institutions.has(normalize(e.institution)));

  const certifications = new Set(profile.certifications.map((c) => normalize(c.name)));
  const languages = new Set(profile.languages.map((l) => normalize(l.name)));
  const inventedCertification = (resume.certifications ?? []).find(
    (c) => !certifications.has(normalize(c.name)),
  );
  const inventedLanguage = (resume.languages ?? []).find((l) => !languages.has(normalize(l.name)));

  if (inventedEmployer || inventedSchool || inventedCertification || inventedLanguage) {
    throw new AiResponseInvalidError(
      'The AI produced a resume containing experience you have not recorded — nothing was saved. Please try again.',
    );
  }
}

/** How many of the model's facts were replaced or removed, for the log line. Counts only, never text. */
export interface ProfileFactCorrections {
  periods: number;
  titles: number;
  skillsDropped: number;
}

export interface GroundedResume {
  resume: ResumeContent;
  corrections: ProfileFactCorrections;
}

const TITLE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  sr: 'senior',
  snr: 'senior',
  jr: 'junior',
  jnr: 'junior',
  mgr: 'manager',
  eng: 'engineer',
  engr: 'engineer',
  dev: 'developer',
  vp: 'vice president',
  svp: 'senior vice president',
  assoc: 'associate',
  asst: 'assistant',
};

/** "Sr. Software Eng" and "Senior Software Engineer" compare equal; "Staff Engineer" does not. */
function titleKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .split(' ')
    .map((word) => TITLE_ABBREVIATIONS[word] ?? word)
    .join(' ');
}

function periodOf(entry: { startDate: Date; endDate: Date | null }): string {
  const end = entry.endDate ? formatProfileMonth(entry.endDate) : 'Present';
  return `${formatProfileMonth(entry.startDate)} – ${end}`;
}

/**
 * The profile row a generated entry is about. Rows are handed out once each,
 * so two stints at one employer end up on two different rows: first the row
 * whose title matches, else the first one not yet taken, else (the model
 * listed the employer more often than the user did) the first row again.
 */
function takeRow<Row>(
  candidates: readonly Row[],
  taken: Set<Row>,
  prefers: (row: Row) => boolean,
): Row | undefined {
  const free = candidates.filter((row) => !taken.has(row));
  const row = free.find(prefers) ?? free[0] ?? candidates[0];
  if (row) taken.add(row);
  return row;
}

function groundExperience(
  entries: readonly ResumeExperienceEntry[],
  rows: readonly WorkExperience[],
  corrections: ProfileFactCorrections,
): ResumeExperienceEntry[] {
  const taken = new Set<WorkExperience>();
  return entries.map((entry) => {
    const sameCompany = rows.filter((row) => normalize(row.company) === normalize(entry.company));
    const row = takeRow(
      sameCompany,
      taken,
      (candidate) => titleKey(candidate.title) === titleKey(entry.title),
    );
    // `assertGrounded` ran first, so there is always a row; this keeps the type honest.
    if (!row) return entry;

    const period = periodOf(row);
    if (entry.period?.trim() !== period) corrections.periods += 1;
    if (titleKey(entry.title) !== titleKey(row.title)) corrections.titles += 1;
    // The stored spelling in every case: the employer and the title are the
    // user's own words, and a promoted title is the model's most tempting edit.
    return { ...entry, company: row.company, title: row.title, period };
  });
}

function groundEducation(
  entries: readonly ResumeEducationEntry[],
  rows: readonly Education[],
  corrections: ProfileFactCorrections,
): ResumeEducationEntry[] {
  const taken = new Set<Education>();
  return entries.map((entry) => {
    const sameSchool = rows.filter(
      (row) => normalize(row.institution) === normalize(entry.institution),
    );
    const qualification = normalize(entry.qualification ?? '');
    const row = takeRow(
      sameSchool,
      taken,
      (candidate) => !!candidate.degree && qualification.includes(normalize(candidate.degree)),
    );
    if (!row) return entry;

    const period = periodOf(row);
    if (entry.period?.trim() !== period) corrections.periods += 1;
    return { ...entry, institution: row.institution, period };
  });
}

/** Names the same technology goes by. Both sides of a comparison pass through this. */
const SKILL_ALIASES: Readonly<Record<string, string>> = {
  postgres: 'postgresql',
  js: 'javascript',
  ts: 'typescript',
  node: 'nodejs',
  'node js': 'nodejs',
  'react js': 'react',
  reactjs: 'react',
  'vue js': 'vue',
  vuejs: 'vue',
  golang: 'go',
  k8s: 'kubernetes',
  gcp: 'google cloud platform',
  'google cloud': 'google cloud platform',
  aws: 'amazon web services',
  'ci cd': 'cicd',
};

/** "Node.js (advanced)" → "nodejs"; "C++" and "C#" keep their signs. */
function skillKey(skill: string): string {
  const plain = skill
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return SKILL_ALIASES[plain] ?? plain;
}

/**
 * Everything the profile says, as one string of skill-normalised words with a
 * space at each end, so a skill is "in the profile" when ` key ` occurs in it.
 * A skill named only in a job's description counts: it is the user's own text.
 */
function profileSkillText(profile: UserProfile): string {
  const texts = [
    ...profile.workExperiences.flatMap((w) => [w.title, w.description ?? '']),
    ...profile.educations.flatMap((e) => [e.degree ?? '', e.field ?? '', e.description ?? '']),
  ];
  const words = texts
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => SKILL_ALIASES[word] ?? word);
  return ` ${words.join(' ')} `;
}

/**
 * Whether the profile has a skill: it lists it, or one of its role or course
 * descriptions names it. Shared with the gap questions (JEF-594), so "the
 * resume may say it" and "we need not ask about it" are the same test.
 */
export function profileSkillMatcher(profile: UserProfile): (item: string) => boolean {
  const listed = new Set(profile.skills.map((skill) => skillKey(skill.name)));
  const mentioned = profileSkillText(profile);
  return (item) => {
    const key = skillKey(item);
    return key !== '' && (listed.has(key) || mentioned.includes(` ${key} `));
  };
}

function groundSkills(
  groups: readonly ResumeSkillGroup[],
  profile: UserProfile,
  corrections: ProfileFactCorrections,
): ResumeSkillGroup[] {
  const known = profileSkillMatcher(profile);

  return groups
    .map((group) => {
      const items = group.items.filter(known);
      corrections.skillsDropped += group.items.length - items.length;
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
}

/** A certification's name, issuer and date are the profile's; the model only chooses which to list. */
function groundCertifications(
  entries: readonly ResumeCertificationEntry[],
  profile: UserProfile,
): ResumeCertificationEntry[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const key = normalize(entry.name);
    const row = profile.certifications.find((c) => normalize(c.name) === key);
    if (!row || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        name: row.name,
        ...(row.issuer ? { issuer: row.issuer } : {}),
        ...(row.issuedAt ? { date: formatProfileMonth(row.issuedAt) } : {}),
      },
    ];
  });
}

/** A language's name and level are the profile's, never the model's. */
function groundLanguages(
  entries: readonly ResumeLanguageEntry[],
  profile: UserProfile,
): ResumeLanguageEntry[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const key = normalize(entry.name);
    const row = profile.languages.find((l) => normalize(l.name) === key);
    if (!row || seen.has(key)) return [];
    seen.add(key);
    return [{ name: row.name, ...(row.proficiency ? { proficiency: row.proficiency } : {}) }];
  });
}

/**
 * Replaces what the model wrote with what the profile holds, wherever the
 * profile holds it (JEF-597):
 *
 * - a role's and a course's period comes from the stored dates;
 * - a job title is the stored title for that employer;
 * - a skill stays only if the profile lists it or one of its descriptions
 *   names it, so a skill the posting asks for cannot arrive as one the
 *   candidate has.
 *
 * It corrects instead of refusing, unlike `assertGrounded`: the employer is
 * real and the right value is known, so the corrected resume is the one the
 * user wanted. Call it after `assertGrounded`. Returns a new resume; the
 * model's reply is not changed.
 */
export function applyProfileFacts(resume: ResumeContent, profile: UserProfile): GroundedResume {
  const corrections: ProfileFactCorrections = { periods: 0, titles: 0, skillsDropped: 0 };
  return {
    resume: {
      ...resume,
      experience: groundExperience(resume.experience, profile.workExperiences, corrections),
      education: groundEducation(resume.education, profile.educations, corrections),
      skills: groundSkills(resume.skills, profile, corrections),
      certifications: groundCertifications(resume.certifications ?? [], profile),
      languages: groundLanguages(resume.languages ?? [], profile),
    },
    corrections,
  };
}
