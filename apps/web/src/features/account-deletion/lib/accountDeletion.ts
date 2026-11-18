/**
 * Deleting an account (JEF-463): request (mails a link), confirm (the link
 * lands on `/confirm-account-deletion`), cancel (from the "scheduled" page or
 * the mailed link on `/cancel-account-deletion`). The documents are in
 * `graphql/accountDeletionQueries.ts`.
 */

/** The date shown for a scheduled deletion: the day, not the time, in the reader's locale. */
export const DELETION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};
