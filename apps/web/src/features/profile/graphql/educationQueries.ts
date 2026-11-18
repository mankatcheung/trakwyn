import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

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

const EDUCATIONS_QUERY = graphql(`
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
`);

export const CREATE_EDUCATION = graphql(`
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
`);

export const UPDATE_EDUCATION = graphql(`
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
`);

export const DELETE_EDUCATION = graphql(`
  mutation DeleteEducation($id: ID!) {
    deleteEducation(id: $id)
  }
`);

export const educationsQueryOptions = queryOptions({
  queryKey: ['educations'],
  queryFn: () => gqlClient.request(EDUCATIONS_QUERY) as Promise<{ educations: Education[] }>,
});
