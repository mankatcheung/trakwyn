import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

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

export const WORK_EXPERIENCES_QUERY = graphql(`
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
`);

export const CREATE_WORK_EXPERIENCE = graphql(`
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
`);

export const UPDATE_WORK_EXPERIENCE = graphql(`
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
`);

export const DELETE_WORK_EXPERIENCE = graphql(`
  mutation DeleteWorkExperience($id: ID!) {
    deleteWorkExperience(id: $id)
  }
`);

export const workExperiencesQueryOptions = queryOptions({
  queryKey: ['workExperiences'],
  queryFn: () =>
    gqlClient.request(WORK_EXPERIENCES_QUERY) as Promise<{ workExperiences: WorkExperience[] }>,
});
