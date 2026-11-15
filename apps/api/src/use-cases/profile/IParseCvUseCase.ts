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

export interface ParsedCvCertification {
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvLanguage {
  name: string;
  proficiency: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvProject {
  name: string;
  role: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvAward {
  title: string;
  issuer: string | null;
  date: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

/** The CV's header details (JEF-527), as the import offers them for empty profile fields. */
export interface ParsedCvContact {
  phone: string | null;
  location: string | null;
  links: string[];
}

export interface ParsedCvProfile {
  contact: ParsedCvContact;
  workExperiences: ParsedCvWorkExperience[];
  educations: ParsedCvEducation[];
  skills: ParsedCvSkill[];
  certifications: ParsedCvCertification[];
  languages: ParsedCvLanguage[];
  projects: ParsedCvProject[];
  awards: ParsedCvAward[];
  /** The CV was longer than the model is given, so later entries may be missing. */
  truncated: boolean;
}

export interface IParseCvUseCase {
  execute(input: ParseCvInput): Promise<ParsedCvProfile>;
}
