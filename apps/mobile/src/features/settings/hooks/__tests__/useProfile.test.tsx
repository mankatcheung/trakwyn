import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../documents/lib/uploadFile', () => ({
  uploadFileToStorage: jest.fn().mockResolvedValue(undefined),
}));

import { gqlRequest } from '../../../../graphql/client';
import { uploadFileToStorage } from '../../../documents/lib/uploadFile';
import {
  useProfile,
  useRemoveAvatar,
  useRemoveBackupEmail,
  useRequestAddBackupEmail,
  useRequestEmailChange,
  useUpdateProfile,
  useUploadAvatar,
} from '../useProfile';
import type { Profile } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUploadFileToStorage = jest.mocked(uploadFileToStorage);

const profile: Profile = {
  id: '1',
  email: 'demo@trakwyn.app',
  name: 'Demo User',
  timezone: 'Europe/London',
  targetRole: 'Senior Engineer',
  avatarUrl: null,
  backupEmail: null,
  backupEmailVerifiedAt: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the profile', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ me: profile });

    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profile);
  });

  it('updates the profile', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateProfile: true });
    const { result } = await renderHook(() => useUpdateProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Name' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { name: 'New Name' });
  });

  it('uploads an avatar via the storage provider and confirms it', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({
        requestAvatarUploadUrl: { uploadUrl: 'http://local/_upload/abc', storageKey: 'abc' },
      })
      .mockResolvedValueOnce({ confirmAvatar: true });
    const { result } = await renderHook(() => useUploadAvatar(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        uri: 'file:///avatar.jpg',
        name: 'avatar.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      });
    });

    expect(mockedUploadFileToStorage).toHaveBeenCalledWith(
      'http://local/_upload/abc',
      'file:///avatar.jpg',
      'image/jpeg',
    );
    expect(mockedGqlRequest).toHaveBeenLastCalledWith(expect.any(String), {
      storageKey: 'abc',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
  });

  it('removes the avatar', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ removeAvatar: true });
    const { result } = await renderHook(() => useRemoveAvatar(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String));
  });

  it('requests an email change', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ requestEmailChange: true });
    const { result } = await renderHook(() => useRequestEmailChange(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ currentPassword: 'pw', newEmail: 'new@example.com' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      currentPassword: 'pw',
      newEmail: 'new@example.com',
    });
  });

  it('requests adding a backup email', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ requestAddBackupEmail: true });
    const { result } = await renderHook(() => useRequestAddBackupEmail(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        currentPassword: 'pw',
        backupEmail: 'backup@example.com',
      });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      currentPassword: 'pw',
      backupEmail: 'backup@example.com',
    });
  });

  it('removes the backup email', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ removeBackupEmail: true });
    const { result } = await renderHook(() => useRemoveBackupEmail(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('pw');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { currentPassword: 'pw' });
  });
});
