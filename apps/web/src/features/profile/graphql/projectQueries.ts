import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export type Project = {
  id: string;
  name: string;
  role: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  createdAt: string;
};

const PROJECTS_QUERY = graphql(`
  query Projects {
    projects {
      id
      name
      role
      url
      startDate
      endDate
      description
      createdAt
    }
  }
`);

export const CREATE_PROJECT = graphql(`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      name
      role
      url
      startDate
      endDate
      description
      createdAt
    }
  }
`);

export const UPDATE_PROJECT = graphql(`
  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
    updateProject(id: $id, input: $input) {
      id
      name
      role
      url
      startDate
      endDate
      description
      createdAt
    }
  }
`);

export const DELETE_PROJECT = graphql(`
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`);

export const projectsQueryOptions = queryOptions({
  queryKey: ['projects'],
  queryFn: () => gqlClient.request(PROJECTS_QUERY) as Promise<{ projects: Project[] }>,
});
