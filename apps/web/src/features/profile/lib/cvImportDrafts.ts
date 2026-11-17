import type { ParsedCvContact, ParsedCvProfile } from '#/features/profile/lib/cvImport';

/**
 * The CV import's review step as data (JEF-461): what the API read, as rows the
 * user can untick and edit before anything is saved. Pure, so the rules (what is
 * pre-ticked, what is valid, what is sent) are tested without a renderer.
 *
 * Every field is a string, as an input holds it; `''` is "not given".
 */

export interface WorkValue {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface EducationValue {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface SkillValue {
  name: string;
  category: string;
  proficiency: string;
}

export interface CertificationValue {
  name: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  credentialUrl: string;
}

export interface LanguageValue {
  name: string;
  proficiency: string;
}

export interface ProjectValue {
  name: string;
  role: string;
  url: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface AwardValue {
  title: string;
  issuer: string;
  date: string;
  description: string;
}

export interface Draft<T> {
  id: string;
  selected: boolean;
  /** The profile already holds this entry; it starts unticked so importing twice adds nothing. */
  alreadyInProfile: boolean;
  value: T;
}

export interface CvDrafts {
  workExperiences: Draft<WorkValue>[];
  educations: Draft<EducationValue>[];
  skills: Draft<SkillValue>[];
  certifications: Draft<CertificationValue>[];
  languages: Draft<LanguageValue>[];
  projects: Draft<ProjectValue>[];
  awards: Draft<AwardValue>[];
}

/** What the `importCvProfile` mutation takes. */
export interface ImportCvProfileInput {
  contact?: { phone?: string; location?: string; links?: string[] };
  workExperiences: Array<{
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    description?: string;
  }>;
  educations: Array<{
    institution: string;
    degree?: string;
    field?: string;
    startDate: string;
    endDate?: string;
    description?: string;
  }>;
  skills: Array<{ name: string; category?: string; proficiency?: string }>;
  /** Sent only when something is ticked: an API from before JEF-592 does not know them. */
  certifications?: Array<{
    name: string;
    issuer?: string;
    issuedAt?: string;
    expiresAt?: string;
    credentialUrl?: string;
  }>;
  languages?: Array<{ name: string; proficiency?: string }>;
  projects?: Array<{
    name: string;
    role?: string;
    url?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  awards?: Array<{ title: string; issuer?: string; date?: string; description?: string }>;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const text = (value: string | null): string => value ?? '';
const given = (value: string): string | undefined => value.trim() || undefined;

export function toDrafts(parsed: ParsedCvProfile): CvDrafts {
  return {
    workExperiences: parsed.workExperiences.map((entry, index) => ({
      id: `work-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        company: entry.company,
        title: entry.title,
        location: text(entry.location),
        startDate: entry.startDate,
        endDate: text(entry.endDate),
        description: text(entry.description),
      },
    })),
    educations: parsed.educations.map((entry, index) => ({
      id: `education-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        institution: entry.institution,
        degree: text(entry.degree),
        field: text(entry.field),
        startDate: entry.startDate,
        endDate: text(entry.endDate),
        description: text(entry.description),
      },
    })),
    skills: parsed.skills.map((entry, index) => ({
      id: `skill-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        name: entry.name,
        category: text(entry.category),
        proficiency: text(entry.proficiency),
      },
    })),
    certifications: (parsed.certifications ?? []).map((entry, index) => ({
      id: `certification-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        name: entry.name,
        issuer: text(entry.issuer),
        issuedAt: text(entry.issuedAt),
        expiresAt: text(entry.expiresAt),
        credentialUrl: text(entry.credentialUrl),
      },
    })),
    languages: (parsed.languages ?? []).map((entry, index) => ({
      id: `language-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: { name: entry.name, proficiency: text(entry.proficiency) },
    })),
    projects: (parsed.projects ?? []).map((entry, index) => ({
      id: `project-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        name: entry.name,
        role: text(entry.role),
        url: text(entry.url),
        startDate: text(entry.startDate),
        endDate: text(entry.endDate),
        description: text(entry.description),
      },
    })),
    awards: (parsed.awards ?? []).map((entry, index) => ({
      id: `award-${index}`,
      selected: !entry.alreadyInProfile,
      alreadyInProfile: entry.alreadyInProfile,
      value: {
        title: entry.title,
        issuer: text(entry.issuer),
        date: text(entry.date),
        description: text(entry.description),
      },
    })),
  };
}

export function isEmpty(drafts: CvDrafts): boolean {
  return allLists(drafts).every((list) => list.length === 0);
}

/** A month input's value, and an end that is not before the start; a blank end means "present". */
function datesValid(startDate: string, endDate: string): boolean {
  if (!MONTH.test(startDate)) return false;
  return endDate === '' || (MONTH.test(endDate) && endDate >= startDate);
}

export function isWorkValid(value: WorkValue): boolean {
  return (
    value.company.trim() !== '' &&
    value.title.trim() !== '' &&
    datesValid(value.startDate, value.endDate)
  );
}

export function isEducationValid(value: EducationValue): boolean {
  return value.institution.trim() !== '' && datesValid(value.startDate, value.endDate);
}

export function isSkillValid(value: SkillValue): boolean {
  return value.name.trim() !== '';
}

/** Dates the new sections may leave blank: each blank or a month, and an end not before the start. */
function optionalMonthsValid(start: string, end: string): boolean {
  if (start !== '' && !MONTH.test(start)) return false;
  if (end !== '' && !MONTH.test(end)) return false;
  return start === '' || end === '' || end >= start;
}

export function isCertificationValid(value: CertificationValue): boolean {
  return value.name.trim() !== '' && optionalMonthsValid(value.issuedAt, value.expiresAt);
}

export function isLanguageValid(value: LanguageValue): boolean {
  return value.name.trim() !== '';
}

export function isProjectValid(value: ProjectValue): boolean {
  return value.name.trim() !== '' && optionalMonthsValid(value.startDate, value.endDate);
}

export function isAwardValid(value: AwardValue): boolean {
  return value.title.trim() !== '' && optionalMonthsValid(value.date, '');
}

function allLists(drafts: CvDrafts): ReadonlyArray<readonly Draft<unknown>[]> {
  return [
    drafts.workExperiences,
    drafts.educations,
    drafts.skills,
    drafts.certifications,
    drafts.languages,
    drafts.projects,
    drafts.awards,
  ];
}

export function countSelected(drafts: CvDrafts): number {
  return allLists(drafts).reduce(
    (total, list) => total + list.filter((draft) => draft.selected).length,
    0,
  );
}

/** A ticked row the user has edited into something the API would refuse. */
export function hasInvalidSelection(drafts: CvDrafts): boolean {
  return (
    drafts.workExperiences.some((d) => d.selected && !isWorkValid(d.value)) ||
    drafts.educations.some((d) => d.selected && !isEducationValid(d.value)) ||
    drafts.skills.some((d) => d.selected && !isSkillValid(d.value)) ||
    drafts.certifications.some((d) => d.selected && !isCertificationValid(d.value)) ||
    drafts.languages.some((d) => d.selected && !isLanguageValid(d.value)) ||
    drafts.projects.some((d) => d.selected && !isProjectValid(d.value)) ||
    drafts.awards.some((d) => d.selected && !isAwardValid(d.value))
  );
}

export function updateDraft<T>(
  list: readonly Draft<T>[],
  id: string,
  change: (draft: Draft<T>) => Draft<T>,
): Draft<T>[] {
  return list.map((draft) => (draft.id === id ? change(draft) : draft));
}

export function setAllSelected<T>(list: readonly Draft<T>[], selected: boolean): Draft<T>[] {
  return list.map((draft) => ({ ...draft, selected }));
}

/** Only the ticked rows, trimmed, with blank optional fields left out. */
export function toImportInput(drafts: CvDrafts, contact?: ParsedCvContact): ImportCvProfileInput {
  const ticked = <T>(list: readonly Draft<T>[]) =>
    list.filter((draft) => draft.selected).map(({ value }) => value);
  const certifications = ticked(drafts.certifications);
  const languages = ticked(drafts.languages);
  const projects = ticked(drafts.projects);
  const awards = ticked(drafts.awards);
  return {
    contact: contact
      ? {
          phone: contact.phone ?? undefined,
          location: contact.location ?? undefined,
          links: contact.links.length > 0 ? contact.links : undefined,
        }
      : undefined,
    workExperiences: drafts.workExperiences
      .filter((draft) => draft.selected)
      .map(({ value }) => ({
        company: value.company.trim(),
        title: value.title.trim(),
        location: given(value.location),
        startDate: value.startDate,
        endDate: given(value.endDate),
        description: given(value.description),
      })),
    educations: drafts.educations
      .filter((draft) => draft.selected)
      .map(({ value }) => ({
        institution: value.institution.trim(),
        degree: given(value.degree),
        field: given(value.field),
        startDate: value.startDate,
        endDate: given(value.endDate),
        description: given(value.description),
      })),
    skills: drafts.skills
      .filter((draft) => draft.selected)
      .map(({ value }) => ({
        name: value.name.trim(),
        category: given(value.category),
        proficiency: given(value.proficiency),
      })),
    ...(certifications.length > 0 && {
      certifications: certifications.map((value) => ({
        name: value.name.trim(),
        issuer: given(value.issuer),
        issuedAt: given(value.issuedAt),
        expiresAt: given(value.expiresAt),
        credentialUrl: given(value.credentialUrl),
      })),
    }),
    ...(languages.length > 0 && {
      languages: languages.map((value) => ({
        name: value.name.trim(),
        proficiency: given(value.proficiency),
      })),
    }),
    ...(projects.length > 0 && {
      projects: projects.map((value) => ({
        name: value.name.trim(),
        role: given(value.role),
        url: given(value.url),
        startDate: given(value.startDate),
        endDate: given(value.endDate),
        description: given(value.description),
      })),
    }),
    ...(awards.length > 0 && {
      awards: awards.map((value) => ({
        title: value.title.trim(),
        issuer: given(value.issuer),
        date: given(value.date),
        description: given(value.description),
      })),
    }),
  };
}
