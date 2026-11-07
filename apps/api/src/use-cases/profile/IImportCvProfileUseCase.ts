export interface ImportCvWorkExperience {
  company: string;
  title: string;
  location?: string | null;
  startDate: Date;
  endDate?: Date | null;
  description?: string | null;
}

export interface ImportCvEducation {
  institution: string;
  degree?: string | null;
  field?: string | null;
  startDate: Date;
  endDate?: Date | null;
  description?: string | null;
}

export interface ImportCvSkill {
  name: string;
  category?: string | null;
  proficiency?: string | null;
}

/** Header details read from the CV; each fills the profile only when that field is empty (JEF-527). */
export interface ImportCvContact {
  phone?: string | null;
  location?: string | null;
  links?: string[] | null;
}

export interface ImportCvProfileInput {
  userId: string;
  contact?: ImportCvContact | null;
  /** The entries the user ticked in the review step, as edited. */
  workExperiences: ImportCvWorkExperience[];
  educations: ImportCvEducation[];
  skills: ImportCvSkill[];
}

export interface ImportCvProfileOutput {
  workExperiences: number;
  educations: number;
  skills: number;
  /** Which empty profile fields the CV's contact details filled. */
  filledContact: Array<'phone' | 'location' | 'profileLinks'>;
}

export interface IImportCvProfileUseCase {
  execute(input: ImportCvProfileInput): Promise<ImportCvProfileOutput>;
}
