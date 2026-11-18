import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export type Certification = {
  id: string;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
  createdAt: string;
};

const CERTIFICATIONS_QUERY = graphql(`
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
`);

export const CREATE_CERTIFICATION = graphql(`
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
`);

export const UPDATE_CERTIFICATION = graphql(`
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
`);

export const DELETE_CERTIFICATION = graphql(`
  mutation DeleteCertification($id: ID!) {
    deleteCertification(id: $id)
  }
`);

export const certificationsQueryOptions = queryOptions({
  queryKey: ['certifications'],
  queryFn: () =>
    gqlClient.request(CERTIFICATIONS_QUERY) as Promise<{ certifications: Certification[] }>,
});
