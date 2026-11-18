import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export type Language = {
  id: string;
  name: string;
  proficiency: string | null;
  createdAt: string;
};

export const LANGUAGES_QUERY = graphql(`
  query Languages {
    languages {
      id
      name
      proficiency
      createdAt
    }
  }
`);

export const CREATE_LANGUAGE = graphql(`
  mutation CreateLanguage($input: CreateLanguageInput!) {
    createLanguage(input: $input) {
      id
      name
      proficiency
      createdAt
    }
  }
`);

export const UPDATE_LANGUAGE = graphql(`
  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {
    updateLanguage(id: $id, input: $input) {
      id
      name
      proficiency
      createdAt
    }
  }
`);

export const DELETE_LANGUAGE = graphql(`
  mutation DeleteLanguage($id: ID!) {
    deleteLanguage(id: $id)
  }
`);

export const languagesQueryOptions = queryOptions({
  queryKey: ['languages'],
  queryFn: () => gqlClient.request(LANGUAGES_QUERY) as Promise<{ languages: Language[] }>,
});
