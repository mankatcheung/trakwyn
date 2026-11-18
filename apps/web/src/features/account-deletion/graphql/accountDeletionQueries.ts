import { graphql } from '#/graphql/generated';

export const REQUEST_ACCOUNT_DELETION = graphql(`
  mutation RequestAccountDeletion {
    requestAccountDeletion
  }
`);

export const CONFIRM_ACCOUNT_DELETION = graphql(`
  mutation ConfirmAccountDeletion($token: String!) {
    confirmAccountDeletion(token: $token)
  }
`);

export const CANCEL_ACCOUNT_DELETION = graphql(`
  mutation CancelAccountDeletion($token: String) {
    cancelAccountDeletion(token: $token)
  }
`);
