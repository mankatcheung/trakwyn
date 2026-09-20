import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  UPDATE_APPLICATION_MUTATION,
  DELETE_APPLICATION_MUTATION,
  RESTORE_APPLICATION_MUTATION,
  PERMANENTLY_DELETE_APPLICATION_MUTATION,
  MOVE_APPLICATION_ON_BOARD_MUTATION,
} from '../graphql/operations';
import type { Application, CreateApplicationInput, UpdateApplicationInput } from '../types';
import { ANALYTICS_EVENTS, captureEvent } from '../../../lib/analytics';

function useInvalidateApplications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['applications'] });
}

export function useCreateApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: (input: CreateApplicationInput) =>
      gqlRequest<{ createApplication: Application }>(CREATE_APPLICATION_MUTATION, {
        input,
      }).then((data) => data.createApplication),
    onSuccess: (application) => {
      // What was created, never what it contains — no company, role or
      // description leaves the device (JEF-349).
      captureEvent(ANALYTICS_EVENTS.APPLICATION_CREATED, {
        has_tags: (application.tags?.length ?? 0) > 0,
      });
      invalidate();
    },
  });
}

export function useUpdateApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateApplicationInput }) =>
      gqlRequest<{ updateApplication: Application }>(UPDATE_APPLICATION_MUTATION, {
        id,
        input,
      }).then((data) => data.updateApplication),
    onSuccess: invalidate,
  });
}

export function useDeleteApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: (id: string) =>
      gqlRequest<{ deleteApplication: boolean }>(DELETE_APPLICATION_MUTATION, { id }),
    onSuccess: invalidate,
  });
}

export function useRestoreApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: (id: string) =>
      gqlRequest<{ restoreApplication: boolean }>(RESTORE_APPLICATION_MUTATION, { id }),
    onSuccess: invalidate,
  });
}

export function usePermanentlyDeleteApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: (id: string) =>
      gqlRequest<{ permanentlyDeleteApplication: boolean }>(
        PERMANENTLY_DELETE_APPLICATION_MUTATION,
        { id },
      ),
    onSuccess: invalidate,
  });
}

export function useMoveApplicationOnBoard() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: (input: { applicationId: string; toStatus: string; orderedIds: string[] }) =>
      gqlRequest(MOVE_APPLICATION_ON_BOARD_MUTATION, { input }),
    onSuccess: invalidate,
  });
}
