import type { WorkExperience } from '#src/domain/workExperience/WorkExperience.js';
import type { Education } from '#src/domain/education/Education.js';
import type { Skill } from '#src/domain/skill/Skill.js';
import type { Certification } from '#src/domain/certification/Certification.js';
import type { Language } from '#src/domain/language/Language.js';
import type { Project } from '#src/domain/project/Project.js';
import type { Award } from '#src/domain/award/Award.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { ICertificationRepository } from '#src/use-cases/ports/ICertificationRepository.js';
import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import type { IProjectRepository } from '#src/use-cases/ports/IProjectRepository.js';
import type { IAwardRepository } from '#src/use-cases/ports/IAwardRepository.js';

/**
 * The user's stored background — work experience, education and skills — as
 * both the records themselves and the prose block that goes into a prompt.
 *
 * Extracted from `GenerateCoverLetterUseCase` and
 * `ComputeResumeMatchScoreUseCase`, which each carried an identical private
 * `buildProfile`; the resume generator would have been a third copy (JEF-199).
 *
 * The records are returned alongside the prose because generating a resume
 * needs to check the model's output against them — prose alone cannot tell you
 * whether an employer the model named is one the user actually entered.
 */
export interface UserProfileRepositories {
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  certificationRepository: ICertificationRepository;
  languageRepository: ILanguageRepository;
  projectRepository: IProjectRepository;
  awardRepository: IAwardRepository;
}

export interface UserProfile {
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  certifications: Certification[];
  languages: Language[];
  projects: Project[];
  awards: Award[];
}

export async function loadUserProfile(
  deps: UserProfileRepositories,
  userId: string,
): Promise<UserProfile> {
  const [workExperiences, educations, skills, certifications, languages, projects, awards] =
    await Promise.all([
      deps.workExperienceRepository.findAllByUserId(userId),
      deps.educationRepository.findAllByUserId(userId),
      deps.skillRepository.findAllByUserId(userId),
      deps.certificationRepository.findAllByUserId(userId),
      deps.languageRepository.findAllByUserId(userId),
      deps.projectRepository.findAllByUserId(userId),
      deps.awardRepository.findAllByUserId(userId),
    ]);
  return { workExperiences, educations, skills, certifications, languages, projects, awards };
}

export function isUserProfileEmpty(profile: UserProfile): boolean {
  return (
    profile.workExperiences.length === 0 &&
    profile.educations.length === 0 &&
    profile.skills.length === 0 &&
    profile.certifications.length === 0 &&
    profile.languages.length === 0 &&
    profile.projects.length === 0 &&
    profile.awards.length === 0
  );
}

const PROFILE_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * A profile date as "Mar 2021": fixed locale, UTC, month and year only (JEF-553).
 * `toLocaleDateString()` gave "1/3/2021", which a model cannot read as 1 March
 * or 3 January, and shifted a midnight-UTC date a day back west of UTC.
 */
export function formatProfileMonth(date: string | Date): string {
  return PROFILE_MONTH_FORMAT.format(new Date(date));
}

export interface FormatUserProfileOptions {
  /**
   * A budget for the whole block. The role and course lines and the skills are
   * always kept; the descriptions share what is left, the most recent role
   * first, so a long history loses its oldest detail rather than its newest
   * (JEF-590). Without it nothing is cut.
   */
  maxChars?: number;
  /**
   * Sections to leave out of the block. A cover letter and a mock interview
   * cite certifications and projects as evidence, but languages and awards
   * only when a posting asks for them, so they skip those two rather than
   * pay for them on every call (JEF-601). A resume keeps everything.
   */
  leaveOut?: readonly ('languages' | 'awards')[];
}

type DatedEntry = WorkExperience | Education;

const DESCRIPTION_INDENT = '  ';
const CUT_MARK = '…';
/** A description cut to less than this says nothing useful, so it is left out. */
const MIN_USEFUL_DESCRIPTION_CHARS = 40;

/** Most recent first: a role still held, then by end date, then by start date. */
function byRecency(a: DatedEntry, b: DatedEntry): number {
  const end = (entry: DatedEntry) =>
    entry.endDate ? new Date(entry.endDate).getTime() : Number.POSITIVE_INFINITY;
  const byEnd = end(b) - end(a);
  // Infinity - Infinity is NaN, so two roles still held fall through to the start date.
  if (byEnd) return byEnd;
  return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
}

/** Each line of a description indented under its role, blank lines dropped. */
function indentDescription(description: string): string {
  return description
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `${DESCRIPTION_INDENT}${line}`)
    .join('\n');
}

function workExperienceLine(we: WorkExperience): string {
  const end = we.endDate ? formatProfileMonth(we.endDate) : 'Present';
  // After the dates, not beside the employer: "Acme, London" reads as a company name.
  const location = we.location?.trim() ? `; ${we.location.trim()}` : '';
  return `- ${we.title} at ${we.company} (${formatProfileMonth(we.startDate)} – ${end}${location})`;
}

function educationLine(edu: Education): string {
  const end = edu.endDate ? formatProfileMonth(edu.endDate) : 'Present';
  return `- ${edu.degree ?? ''} ${edu.field ?? ''} at ${edu.institution} (${formatProfileMonth(edu.startDate)} – ${end})`;
}

function skillLines(skills: Skill[]): string[] {
  const grouped = new Map<string, string[]>();
  for (const skill of skills) {
    const category = skill.category ?? 'General';
    const label = skill.proficiency ? `${skill.name} (${skill.proficiency})` : skill.name;
    grouped.set(category, [...(grouped.get(category) ?? []), label]);
  }
  return Array.from(grouped, ([category, names]) => `- ${category}: ${names.join(', ')}`);
}

function certificationLine(cert: Certification): string {
  const details = [
    cert.issuer?.trim(),
    cert.issuedAt ? `issued ${formatProfileMonth(cert.issuedAt)}` : null,
    cert.expiresAt ? `expires ${formatProfileMonth(cert.expiresAt)}` : null,
  ].filter(Boolean);
  return `- ${cert.name}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
}

/** A project or award's description, indented under its line and cut to a short allowance. */
const SECTION_DESCRIPTION_MAX_CHARS = 600;

function projectLines(project: Project): string[] {
  const dates = project.startDate
    ? `${formatProfileMonth(project.startDate)} – ${project.endDate ? formatProfileMonth(project.endDate) : 'Present'}`
    : null;
  const details = [project.role?.trim(), dates].filter(Boolean);
  const head = `- ${project.name}${details.length > 0 ? ` (${details.join('; ')})` : ''}`;
  const description = project.description
    ? indentDescription(project.description.slice(0, SECTION_DESCRIPTION_MAX_CHARS))
    : '';
  return description ? [head, description] : [head];
}

function awardLines(award: Award): string[] {
  const details = [award.issuer?.trim(), award.date ? formatProfileMonth(award.date) : null].filter(
    Boolean,
  );
  const head = `- ${award.title}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
  const description = award.description
    ? indentDescription(award.description.slice(0, SECTION_DESCRIPTION_MAX_CHARS))
    : '';
  return description ? [head, description] : [head];
}

function languageLine(language: Language): string {
  return `- ${language.name}${language.proficiency ? ` (${language.proficiency})` : ''}`;
}

/**
 * Which descriptions fit, and how much of each. Work experience comes before
 * education, each most recent first; the first one that no longer fits whole
 * is cut at the budget and everything after it is left out.
 */
function allotDescriptions(profile: UserProfile, budget: number): Map<DatedEntry, string> {
  const entries: DatedEntry[] = [
    ...[...profile.workExperiences].sort(byRecency),
    ...[...profile.educations].sort(byRecency),
  ];
  const allotted = new Map<DatedEntry, string>();
  let remaining = budget;
  for (const entry of entries) {
    const text = entry.description ? indentDescription(entry.description) : '';
    if (!text) continue;
    // +1 for the line break that joins it to the block.
    const cost = text.length + 1;
    if (cost <= remaining) {
      allotted.set(entry, text);
      remaining -= cost;
      continue;
    }
    const room = remaining - 1 - CUT_MARK.length;
    if (room >= MIN_USEFUL_DESCRIPTION_CHARS) {
      allotted.set(entry, `${text.slice(0, room).trimEnd()}${CUT_MARK}`);
    }
    break;
  }
  return allotted;
}

/**
 * The prompt-facing rendering. Empty profile → empty string, as before.
 *
 * Descriptions are sent whole (JEF-590): they are the only source a resume's
 * bullets may be written from, and the 200 characters each was once cut to
 * left the model one sentence per job.
 */
export function formatUserProfile(
  profile: UserProfile,
  options: FormatUserProfileOptions = {},
): string {
  const { workExperiences, educations, skills, certifications = [], projects = [] } = profile;
  const leftOut = new Set(options.leaveOut ?? []);
  const languages = leftOut.has('languages') ? [] : (profile.languages ?? []);
  const awards = leftOut.has('awards') ? [] : (profile.awards ?? []);
  const sections = (describe: (line: string, entry: DatedEntry) => string[]): string[] => [
    ...(workExperiences.length > 0
      ? [
          'Work Experience:',
          ...workExperiences.flatMap((we) => describe(workExperienceLine(we), we)),
        ]
      : []),
    ...(educations.length > 0
      ? ['\nEducation:', ...educations.flatMap((edu) => describe(educationLine(edu), edu))]
      : []),
    ...(skills.length > 0 ? ['\nSkills:', ...skillLines(skills)] : []),
    ...(certifications.length > 0
      ? ['\nCertifications:', ...certifications.map(certificationLine)]
      : []),
    ...(projects.length > 0 ? ['\nProjects:', ...projects.flatMap(projectLines)] : []),
    ...(awards.length > 0 ? ['\nAwards:', ...awards.flatMap(awardLines)] : []),
    ...(languages.length > 0 ? ['\nLanguages:', ...languages.map(languageLine)] : []),
  ];

  const fixedLength = sections((line) => [line]).join('\n').length;
  const descriptions = allotDescriptions(
    profile,
    options.maxChars === undefined ? Number.POSITIVE_INFINITY : options.maxChars - fixedLength,
  );

  return sections((line, entry) => {
    const description = descriptions.get(entry);
    return description ? [line, description] : [line];
  }).join('\n');
}
