import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { CONTACTS_QUERY } from '../graphql/contactOperations';
import type { Contact } from '../types';

export const contactsQueryKey = (applicationId: string) => ['contacts', applicationId] as const;

export function useContacts(applicationId: string) {
  return useQuery({
    queryKey: contactsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ contacts: Contact[] }>(CONTACTS_QUERY, { applicationId }).then(
        (data) => data.contacts,
      ),
    enabled: Boolean(applicationId),
  });
}
