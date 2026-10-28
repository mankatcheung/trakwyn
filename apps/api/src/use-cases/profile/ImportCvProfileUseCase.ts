import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { CV_IMPORT } from '#src/use-cases/constants.js';
import type {
  CreateEducationData,
  IEducationRepository,
} from '#src/use-cases/ports/IEducationRepository.js';
import type { CreateSkillData, ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type {
  CreateWorkExperienceData,
  IWorkExperienceRepository,
} from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type {
  IImportCvProfileUseCase,
  ImportCvEducation,
  ImportCvProfileInput,
  ImportCvProfileOutput,
  ImportCvSkill,
  ImportCvWorkExperience,
} from '#src/use-cases/profile/IImportCvProfileUseCase.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  transactionManager?: ITransactionManager;
  generateId: () => string;
}

/**
 * Creates the entries a user ticked in the CV import's review step (JEF-461).
 *
 * The entries come from a client that let the user edit them, so they are
 * validated here as any other input would be. Every section is checked before
 * the first write, and the writes share one transaction: a CV is imported
 * whole or not at all.
 */
export class ImportCvProfileUseCase implements IImportCvProfileUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ImportCvProfileInput): Promise<ImportCvProfileOutput> {
    const workExperiences = this.checkSection(
      input.workExperiences,
      CV_IMPORT.MAX_WORK_EXPERIENCES,
      'work experiences',
    ).map((entry) => this.workExperience(input.userId, entry));
    const educations = this.checkSection(
      input.educations,
      CV_IMPORT.MAX_EDUCATIONS,
      'education entries',
    ).map((entry) => this.education(input.userId, entry));
    const skills = this.checkSection(input.skills, CV_IMPORT.MAX_SKILLS, 'skills').map((entry) =>
      this.skill(input.userId, entry),
    );

    if (workExperiences.length + educations.length + skills.length === 0) {
      throw new ValidationError('Select at least one item to import');
    }

    await runInTransaction(this.deps.transactionManager, async () => {
      for (const data of workExperiences) await this.deps.workExperienceRepository.create(data);
      for (const data of educations) await this.deps.educationRepository.create(data);
      for (const data of skills) await this.deps.skillRepository.create(data);
    });

    return {
      workExperiences: workExperiences.length,
      educations: educations.length,
      skills: skills.length,
    };
  }

  private checkSection<T>(entries: readonly T[], max: number, label: string): readonly T[] {
    if (entries.length > max) {
      throw new ValidationError(`Too many ${label} to import at once (at most ${max})`);
    }
    return entries;
  }

  private workExperience(userId: string, entry: ImportCvWorkExperience): CreateWorkExperienceData {
    const { startDate, endDate } = dateRange(entry.startDate, entry.endDate);
    return {
      id: this.deps.generateId(),
      userId,
      company: required(entry.company, 'Company'),
      title: required(entry.title, 'Job title'),
      location: optional(entry.location, CV_IMPORT.SHORT_FIELD_MAX_CHARS, 'Location'),
      startDate,
      endDate,
      description: optional(entry.description, CV_IMPORT.DESCRIPTION_MAX_CHARS, 'Description'),
    };
  }

  private education(userId: string, entry: ImportCvEducation): CreateEducationData {
    const { startDate, endDate } = dateRange(entry.startDate, entry.endDate);
    return {
      id: this.deps.generateId(),
      userId,
      institution: required(entry.institution, 'Institution'),
      degree: optional(entry.degree, CV_IMPORT.SHORT_FIELD_MAX_CHARS, 'Degree'),
      field: optional(entry.field, CV_IMPORT.SHORT_FIELD_MAX_CHARS, 'Field of study'),
      startDate,
      endDate,
      description: optional(entry.description, CV_IMPORT.DESCRIPTION_MAX_CHARS, 'Description'),
    };
  }

  private skill(userId: string, entry: ImportCvSkill): CreateSkillData {
    return {
      id: this.deps.generateId(),
      userId,
      name: required(entry.name, 'Skill name'),
      category: optional(entry.category, CV_IMPORT.SHORT_FIELD_MAX_CHARS, 'Category'),
      proficiency: optional(entry.proficiency, CV_IMPORT.SHORT_FIELD_MAX_CHARS, 'Proficiency'),
    };
  }
}

function required(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new ValidationError(`${label} is required`);
  return tooLongCheck(text, CV_IMPORT.SHORT_FIELD_MAX_CHARS, label);
}

function optional(value: string | null | undefined, max: number, label: string): string | null {
  const text = value?.trim();
  return text ? tooLongCheck(text, max, label) : null;
}

function tooLongCheck(text: string, max: number, label: string): string {
  if (text.length > max) {
    throw new ValidationError(`${label} must be at most ${max} characters`);
  }
  return text;
}

function dateRange(
  startDate: Date,
  endDate: Date | null | undefined,
): { startDate: Date; endDate: Date | null } {
  assertBelievable(startDate, 'Start date');
  if (endDate == null) return { startDate, endDate: null };
  assertBelievable(endDate, 'End date');
  if (endDate < startDate) throw new ValidationError('End date must not be before the start date');
  return { startDate, endDate };
}

function assertBelievable(date: Date, label: string): void {
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < CV_IMPORT.MIN_YEAR || year > CV_IMPORT.MAX_YEAR) {
    throw new ValidationError(`${label} is not a valid date`);
  }
}
