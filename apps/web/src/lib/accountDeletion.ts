/**
 * Deleting an account (JEF-463): request (mails a link), confirm (the link
 * lands on `/confirm-account-deletion`), cancel (from the "scheduled" page or
 * the mailed link on `/cancel-account-deletion`). Inline strings like the rest
 * of Settings, so no `.graphql` file or codegen.
 */

export const REQUEST_ACCOUNT_DELETION = `mutation RequestAccountDeletion { requestAccountDeletion }`;

export const CONFIRM_ACCOUNT_DELETION = `
  mutation ConfirmAccountDeletion($token: String!) {
    confirmAccountDeletion(token: $token)
  }
`;

export const CANCEL_ACCOUNT_DELETION = `
  mutation CancelAccountDeletion($token: String) {
    cancelAccountDeletion(token: $token)
  }
`;

/** The date shown for a scheduled deletion: the day, not the time, in the reader's locale. */
export const DELETION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};
