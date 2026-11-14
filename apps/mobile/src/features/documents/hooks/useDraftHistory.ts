import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_DRAFT_VERSION_MUTATION,
  DRAFT_VERSIONS_QUERY,
  DRAFT_VERSION_QUERY,
  RESTORE_DRAFT_VERSION_MUTATION,
} from '../graphql/draftOperations';
import type { DraftVersionPreview, DraftVersionSummary, RestoredDraft } from '../types';
import { documentDraftQueryKey } from './useDocumentDraftQueries';

export const draftVersionsQueryKey = (draftId: string) => ['draftVersions', draftId] as const;
export const draftVersionQueryKey = (versionId: string) => ['draftVersion', versionId] as const;

/** The versions kept of a draft, newest first (the API orders them). Fetched when `enabled`. */
export function useDraftVersions(draftId: string, enabled: boolean) {
  return useQuery({
    queryKey: draftVersionsQueryKey(draftId),
    enabled: enabled && Boolean(draftId),
    queryFn: () =>
      gqlRequest<{ documentDraftVersions: DraftVersionSummary[] }>(DRAFT_VERSIONS_QUERY, {
        draftId,
      }).then((data) => data.documentDraftVersions),
  });
}

/** One version's content, for the read-only preview. */
export function useDraftVersion(versionId: string | null) {
  return useQuery({
    queryKey: draftVersionQueryKey(versionId ?? ''),
    enabled: versionId !== null,
    queryFn: () =>
      gqlRequest<{ documentDraftVersion: DraftVersionPreview }>(DRAFT_VERSION_QUERY, {
        id: versionId,
      }).then((data) => data.documentDraftVersion),
  });
}

/** "Save version": the server snapshots what it has saved of the draft. */
export function useCreateDraftVersion(draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ createDocumentDraftVersion: { id: string } }>(CREATE_DRAFT_VERSION_MUTATION, {
        draftId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: draftVersionsQueryKey(draftId) }),
  });
}

/** Restores a version on the server; the current text is kept as a version there. */
export function useRestoreDraftVersion(draftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      gqlRequest<{ restoreDocumentDraftVersion: RestoredDraft }>(RESTORE_DRAFT_VERSION_MUTATION, {
        versionId,
      }).then((data) => data.restoreDocumentDraftVersion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftVersionsQueryKey(draftId) });
      void queryClient.invalidateQueries({ queryKey: documentDraftQueryKey(draftId) });
    },
  });
}
