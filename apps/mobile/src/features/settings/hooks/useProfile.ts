import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CONFIRM_AVATAR_MUTATION,
  PROFILE_QUERY,
  REMOVE_AVATAR_MUTATION,
  REMOVE_BACKUP_EMAIL_MUTATION,
  REQUEST_ADD_BACKUP_EMAIL_MUTATION,
  REQUEST_AVATAR_UPLOAD_URL_MUTATION,
  REQUEST_EMAIL_CHANGE_MUTATION,
  UPDATE_PROFILE_MUTATION,
} from '../graphql/operations';
import { uploadFileToStorage } from '../../documents/lib/uploadFile';
import type { Profile, RequestAvatarUploadUrlResult } from '../types';

export const profileQueryKey = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: () => gqlRequest<{ me: Profile }>(PROFILE_QUERY).then((data) => data.me),
  });
}

export interface UpdateProfileInput {
  name?: string;
  timezone?: string;
  targetRole?: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      gqlRequest<{ updateProfile: boolean }>(UPDATE_PROFILE_MUTATION, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}

export interface UploadAvatarInput {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadAvatarInput): Promise<void> => {
      const { requestAvatarUploadUrl } = await gqlRequest<{
        requestAvatarUploadUrl: RequestAvatarUploadUrlResult;
      }>(REQUEST_AVATAR_UPLOAD_URL_MUTATION, { filename: input.name, mimeType: input.mimeType });

      await uploadFileToStorage(requestAvatarUploadUrl.uploadUrl, input.uri, input.mimeType);

      await gqlRequest<{ confirmAvatar: boolean }>(CONFIRM_AVATAR_MUTATION, {
        storageKey: requestAvatarUploadUrl.storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gqlRequest<{ removeAvatar: boolean }>(REMOVE_AVATAR_MUTATION),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}

export interface RequestEmailChangeInput {
  currentPassword: string;
  newEmail: string;
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (input: RequestEmailChangeInput) =>
      gqlRequest<{ requestEmailChange: boolean }>(REQUEST_EMAIL_CHANGE_MUTATION, input),
  });
}

export interface RequestAddBackupEmailInput {
  currentPassword: string;
  backupEmail: string;
}

export function useRequestAddBackupEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestAddBackupEmailInput) =>
      gqlRequest<{ requestAddBackupEmail: boolean }>(REQUEST_ADD_BACKUP_EMAIL_MUTATION, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}

export function useRemoveBackupEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (currentPassword: string) =>
      gqlRequest<{ removeBackupEmail: boolean }>(REMOVE_BACKUP_EMAIL_MUTATION, {
        currentPassword,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}
