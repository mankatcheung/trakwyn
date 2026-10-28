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
