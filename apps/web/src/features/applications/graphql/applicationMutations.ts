/** Typed documents for the applications feature's writes. */

import { graphql } from '#/graphql/generated';

export const BULK_UPDATE_APPLICATION = graphql(`
  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) {
      id
    }
  }
`);

export const CREATE_APPLICATION = graphql(`
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      id
    }
  }
`);

export const PARSE_JOB_DESCRIPTION = graphql(`
  mutation ParseJobDescription($text: String, $url: String) {
    parseJobDescription(text: $text, url: $url) {
      company
      role
      location
      salary
      description
      postingText
    }
  }
`);

export const DELETE_APPLICATION = graphql(`
  mutation DeleteApplication($id: ID!) {
    deleteApplication(id: $id)
  }
`);
