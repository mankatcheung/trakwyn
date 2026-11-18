import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export type Award = {
  id: string;
  title: string;
  issuer: string | null;
  date: string | null;
  description: string | null;
  createdAt: string;
};

export const AWARDS_QUERY = graphql(`
  query Awards {
    awards {
      id
      title
      issuer
      date
      description
      createdAt
    }
  }
`);

export const CREATE_AWARD = graphql(`
  mutation CreateAward($input: CreateAwardInput!) {
    createAward(input: $input) {
      id
      title
      issuer
      date
      description
      createdAt
    }
  }
`);

export const UPDATE_AWARD = graphql(`
  mutation UpdateAward($id: ID!, $input: UpdateAwardInput!) {
    updateAward(id: $id, input: $input) {
      id
      title
      issuer
      date
      description
      createdAt
    }
  }
`);

export const DELETE_AWARD = graphql(`
  mutation DeleteAward($id: ID!) {
    deleteAward(id: $id)
  }
`);

export const awardsQueryOptions = queryOptions({
  queryKey: ['awards'],
  queryFn: () => gqlClient.request(AWARDS_QUERY) as Promise<{ awards: Award[] }>,
});
