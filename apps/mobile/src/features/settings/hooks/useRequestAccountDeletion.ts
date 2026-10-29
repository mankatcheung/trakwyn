import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { REQUEST_ACCOUNT_DELETION_MUTATION } from '../graphql/operations';

/**
 * Starts deleting the account (JEF-463): the API mails a link that schedules
 * the deletion. Nothing is deleted by this call.
 */
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ requestAccountDeletion: boolean }>(REQUEST_ACCOUNT_DELETION_MUTATION),
  });
}
