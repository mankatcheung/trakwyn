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

export interface ImportCvCertification {
  name: string;
  issuer?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  credentialUrl?: string | null;
}

export interface ImportCvLanguage {
  name: string;
  proficiency?: string | null;
}

export interface ImportCvProject {
  name: string;
  role?: string | null;
  url?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  description?: string | null;
}

export interface ImportCvAward {
  title: string;
  issuer?: string | null;
  date?: Date | null;
  description?: string | null;
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
  /** The four sections added in JEF-592; a client from before them sends none. */
  certifications?: ImportCvCertification[];
  languages?: ImportCvLanguage[];
  projects?: ImportCvProject[];
  awards?: ImportCvAward[];
}

export interface ImportCvProfileOutput {
  workExperiences: number;
  educations: number;
  skills: number;
  certifications: number;
  languages: number;
  projects: number;
  awards: number;
  /** Which empty profile fields the CV's contact details filled. */
  filledContact: Array<'phone' | 'location' | 'profileLinks'>;
}

export interface IImportCvProfileUseCase {
  execute(input: ImportCvProfileInput): Promise<ImportCvProfileOutput>;
}
