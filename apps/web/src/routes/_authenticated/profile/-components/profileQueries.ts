import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

// The profile page and the dashboard's CV profile card read the same three
// queries under the same keys, so an edit on the page invalidates the card too.

// ── Queries ──────────────────────────────────────────────────────────────

const WORK_EXPERIENCES_QUERY = `
  query WorkExperiences {
    workExperiences {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const EDUCATIONS_QUERY = `
  query Educations {
    educations {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const SKILLS_QUERY = `
  query Skills {
    skills {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

const CERTIFICATIONS_QUERY = `
  query Certifications {
    certifications {
      id
      name
      issuer
      issuedAt
      expiresAt
      credentialUrl
      createdAt
    }
  }
`;

const LANGUAGES_QUERY = `
  query Languages {
    languages {
      id
      name
      proficiency
      createdAt
    }
  }
`;

// ── Mutations ────────────────────────────────────────────────────────────

export const CREATE_WORK_EXPERIENCE = `
  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {
    createWorkExperience(input: $input) {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_WORK_EXPERIENCE = `
  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {
    updateWorkExperience(id: $id, input: $input) {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_WORK_EXPERIENCE = `
  mutation DeleteWorkExperience($id: ID!) {
    deleteWorkExperience(id: $id)
  }
`;

export const CREATE_EDUCATION = `
  mutation CreateEducation($input: CreateEducationInput!) {
    createEducation(input: $input) {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_EDUCATION = `
  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {
    updateEducation(id: $id, input: $input) {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_EDUCATION = `
  mutation DeleteEducation($id: ID!) {
    deleteEducation(id: $id)
  }
`;

export const CREATE_SKILL = `
  mutation CreateSkill($input: CreateSkillInput!) {
    createSkill(input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

export const UPDATE_SKILL = `
  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {
    updateSkill(id: $id, input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

export const DELETE_SKILL = `
  mutation DeleteSkill($id: ID!) {
    deleteSkill(id: $id)
  }
`;

export const CREATE_CERTIFICATION = `
  mutation CreateCertification($input: CreateCertificationInput!) {
    createCertification(input: $input) {
      id
      name
      issuer
      issuedAt
      expiresAt
      credentialUrl
      createdAt
    }
  }
`;

export const UPDATE_CERTIFICATION = `
  mutation UpdateCertification($id: ID!, $input: UpdateCertificationInput!) {
    updateCertification(id: $id, input: $input) {
      id
      name
      issuer
      issuedAt
      expiresAt
      credentialUrl
      createdAt
    }
  }
`;

export const DELETE_CERTIFICATION = `
  mutation DeleteCertification($id: ID!) {
    deleteCertification(id: $id)
  }
`;

export const CREATE_LANGUAGE = `
  mutation CreateLanguage($input: CreateLanguageInput!) {
    createLanguage(input: $input) {
      id
      name
      proficiency
      createdAt
    }
  }
`;

export const UPDATE_LANGUAGE = `
  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {
    updateLanguage(id: $id, input: $input) {
      id
      name
      proficiency
      createdAt
    }
  }
`;

export const DELETE_LANGUAGE = `
  mutation DeleteLanguage($id: ID!) {
    deleteLanguage(id: $id)
  }
`;

/** The confirm step of the CV import (JEF-461); reading the file is `uploadCv` in `lib/cvImport`. */
export const IMPORT_CV_PROFILE = `
  mutation ImportCvProfile($input: ImportCvProfileInput!) {
    importCvProfile(input: $input) {
      workExperiences
      educations
      skills
    }
  }
`;

// ── Types ────────────────────────────────────────────────────────────────

export type WorkExperience = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Education = {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Skill = {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
  createdAt: string;
};

export type Certification = {
  id: string;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
  createdAt: string;
};

export type Language = {
  id: string;
  name: string;
  proficiency: string | null;
  createdAt: string;
};

// ── Query options ────────────────────────────────────────────────────────

export const workExperiencesQueryOptions = queryOptions({
  queryKey: ['workExperiences'],
  queryFn: () => gqlClient.request<{ workExperiences: WorkExperience[] }>(WORK_EXPERIENCES_QUERY),
});

export const educationsQueryOptions = queryOptions({
  queryKey: ['educations'],
  queryFn: () => gqlClient.request<{ educations: Education[] }>(EDUCATIONS_QUERY),
});

export const skillsQueryOptions = queryOptions({
  queryKey: ['skills'],
  queryFn: () => gqlClient.request<{ skills: Skill[] }>(SKILLS_QUERY),
});

export const certificationsQueryOptions = queryOptions({
  queryKey: ['certifications'],
  queryFn: () => gqlClient.request<{ certifications: Certification[] }>(CERTIFICATIONS_QUERY),
});

export const languagesQueryOptions = queryOptions({
  queryKey: ['languages'],
  queryFn: () => gqlClient.request<{ languages: Language[] }>(LANGUAGES_QUERY),
});
