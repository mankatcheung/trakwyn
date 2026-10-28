export interface ParseCvInput {
  userId: string;
  /** The uploaded file, held in memory. It is read once and never stored. */
  buffer: Buffer;
  mimeType: string;
}

/** Dates are `YYYY-MM`, the value an `<input type="month">` holds. */
export interface ParsedCvWorkExperience {
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvEducation {
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvSkill {
  name: string;
  category: string | null;
  proficiency: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvProfile {
  workExperiences: ParsedCvWorkExperience[];
  educations: ParsedCvEducation[];
  skills: ParsedCvSkill[];
  /** The CV was longer than the model is given, so later entries may be missing. */
  truncated: boolean;
}

export interface IParseCvUseCase {
  execute(input: ParseCvInput): Promise<ParsedCvProfile>;
}
