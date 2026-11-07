import type { User } from '#src/domain/user/User.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { CONTENT_LIMITS, CV_IMPORT } from '#src/use-cases/constants.js';
import { assertRoomFor } from '#src/use-cases/shared/assertUnderLimit.js';
import type {
  CreateEducationData,
  IEducationRepository,
} from '#src/use-cases/ports/IEducationRepository.js';
import type { CreateSkillData, ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { readLocation, readPhone, readProfileLinks } from '#src/use-cases/shared/profileContact.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import type {
  CreateWorkExperienceData,
  IWorkExperienceRepository,
} from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type {
  IImportCvProfileUseCase,
  ImportCvEducation,
  ImportCvContact,
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
  userRepository: IUserRepository;
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
 *
 * The CV's contact details (JEF-527) fill only the profile fields that are
 * still empty: what the user typed is more trustworthy than a parse.
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

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    const contactFill = fillEmptyContact(user, input.contact);
    const filledContact = Object.keys(contactFill) as ImportCvProfileOutput['filledContact'];

    if (workExperiences.length + educations.length + skills.length + filledContact.length === 0) {
      throw new ValidationError('Select at least one item to import');
    }

    // Checked before the first write so a CV that does not fit is refused whole.
    const [haveWork, haveEducation, haveSkills] = await Promise.all([
      this.deps.workExperienceRepository.findAllByUserId(input.userId),
      this.deps.educationRepository.findAllByUserId(input.userId),
      this.deps.skillRepository.findAllByUserId(input.userId),
    ]);
    assertRoomFor(
      haveWork.length,
      workExperiences.length,
      CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER,
      'work experiences',
    );
    assertRoomFor(
      haveEducation.length,
      educations.length,
      CONTENT_LIMITS.EDUCATIONS_PER_USER,
      'education entries',
    );
    assertRoomFor(haveSkills.length, skills.length, CONTENT_LIMITS.SKILLS_PER_USER, 'skills');

    await runInTransaction(this.deps.transactionManager, async () => {
      for (const data of workExperiences) await this.deps.workExperienceRepository.create(data);
      for (const data of educations) await this.deps.educationRepository.create(data);
      for (const data of skills) await this.deps.skillRepository.create(data);
      if (filledContact.length > 0)
        await this.deps.userRepository.update(input.userId, contactFill);
    });

    return {
      workExperiences: workExperiences.length,
      educations: educations.length,
      skills: skills.length,
      filledContact,
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

/** The contact fields the CV can fill: only those the profile has empty and the CV gives a usable value for. */
function fillEmptyContact(
  user: Pick<User, 'phone' | 'location' | 'profileLinks'>,
  contact: ImportCvContact | null | undefined,
): { phone?: string; location?: string; profileLinks?: string[] } {
  if (!contact) return {};
  const phone = user.phone ? null : readPhone(contact.phone);
  const location = user.location ? null : readLocation(contact.location);
  const links = user.profileLinks?.length ? [] : readProfileLinks(contact.links);
  return {
    ...(phone ? { phone } : {}),
    ...(location ? { location } : {}),
    ...(links.length > 0 ? { profileLinks: links } : {}),
  };
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
