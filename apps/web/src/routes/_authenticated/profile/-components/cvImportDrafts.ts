import type { ParsedCvProfile } from '#/lib/cvImport';

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
}

/** What the `importCvProfile` mutation takes. */
export interface ImportCvProfileInput {
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
  };
}

export function isEmpty(drafts: CvDrafts): boolean {
  return drafts.workExperiences.length + drafts.educations.length + drafts.skills.length === 0;
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

export function countSelected(drafts: CvDrafts): number {
  return [drafts.workExperiences, drafts.educations, drafts.skills].reduce(
    (total, list) => total + list.filter((draft) => draft.selected).length,
    0,
  );
}

/** A ticked row the user has edited into something the API would refuse. */
export function hasInvalidSelection(drafts: CvDrafts): boolean {
  return (
    drafts.workExperiences.some((d) => d.selected && !isWorkValid(d.value)) ||
    drafts.educations.some((d) => d.selected && !isEducationValid(d.value)) ||
    drafts.skills.some((d) => d.selected && !isSkillValid(d.value))
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
export function toImportInput(drafts: CvDrafts): ImportCvProfileInput {
  return {
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
  };
}
