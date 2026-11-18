import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export type Skill = {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
  createdAt: string;
};

export const SKILLS_QUERY = graphql(`
  query Skills {
    skills {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`);

export const CREATE_SKILL = graphql(`
  mutation CreateSkill($input: CreateSkillInput!) {
    createSkill(input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`);

export const UPDATE_SKILL = graphql(`
  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {
    updateSkill(id: $id, input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`);

export const DELETE_SKILL = graphql(`
  mutation DeleteSkill($id: ID!) {
    deleteSkill(id: $id)
  }
`);

export const skillsQueryOptions = queryOptions({
  queryKey: ['skills'],
  queryFn: () => gqlClient.request(SKILLS_QUERY) as Promise<{ skills: Skill[] }>,
});
