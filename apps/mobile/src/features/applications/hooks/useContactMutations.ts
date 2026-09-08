import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_CONTACT_MUTATION,
  DELETE_CONTACT_MUTATION,
  UPDATE_CONTACT_MUTATION,
} from '../graphql/contactOperations';
import { contactsQueryKey } from './useContactQueries';
import type { Contact, ContactInput } from '../types';

export function useCreateContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) =>
      gqlRequest<{ createContact: Contact }>(CREATE_CONTACT_MUTATION, {
        applicationId,
        ...input,
      }).then((data) => data.createContact),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsQueryKey(applicationId) }),
  });
}

export function useUpdateContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContactInput }) =>
      gqlRequest<{ updateContact: Contact }>(UPDATE_CONTACT_MUTATION, { id, ...input }).then(
        (data) => data.updateContact,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsQueryKey(applicationId) }),
  });
}

export function useDeleteContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      gqlRequest<{ deleteContact: boolean }>(DELETE_CONTACT_MUTATION, { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsQueryKey(applicationId) }),
  });
}
