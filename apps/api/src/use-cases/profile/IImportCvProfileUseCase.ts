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

export interface ImportCvProfileInput {
  userId: string;
  /** The entries the user ticked in the review step, as edited. */
  workExperiences: ImportCvWorkExperience[];
  educations: ImportCvEducation[];
  skills: ImportCvSkill[];
}

export interface ImportCvProfileOutput {
  workExperiences: number;
  educations: number;
  skills: number;
}

export interface IImportCvProfileUseCase {
  execute(input: ImportCvProfileInput): Promise<ImportCvProfileOutput>;
}
