import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../hooks/useProfile', () => ({
  useProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  useUploadAvatar: jest.fn(),
  useRemoveAvatar: jest.fn(),
  useRequestEmailChange: jest.fn(),
  useRequestAddBackupEmail: jest.fn(),
  useRemoveBackupEmail: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../auth/useStepUpReauth', () => {
  class StepUpCancelledError extends Error {}
  return { StepUpCancelledError, useStepUpReauth: jest.fn() };
});

import * as DocumentPicker from 'expo-document-picker';
import {
  useProfile,
  useRemoveAvatar,
  useRemoveBackupEmail,
  useRequestAddBackupEmail,
  useRequestEmailChange,
  useUpdateProfile,
  useUploadAvatar,
} from '../../hooks/useProfile';
import { useStepUpReauth } from '../../../../auth/useStepUpReauth';
import { ProfileScreen } from '../ProfileScreen';
import type { Profile } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseProfile = jest.mocked(useProfile);
const mockedUseUpdateProfile = jest.mocked(useUpdateProfile);
const mockedUseUploadAvatar = jest.mocked(useUploadAvatar);
const mockedUseRemoveAvatar = jest.mocked(useRemoveAvatar);
const mockedUseRequestEmailChange = jest.mocked(useRequestEmailChange);
const mockedUseRequestAddBackupEmail = jest.mocked(useRequestAddBackupEmail);
const mockedUseRemoveBackupEmail = jest.mocked(useRemoveBackupEmail);
const mockedUseStepUpReauth = jest.mocked(useStepUpReauth);
const mockedUseTheme = jest.mocked(useTheme);
const mockedGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);

const passThrough = <T,>(fn: () => Promise<T>) => fn();

const profile: Profile = {
  id: '1',
  email: 'demo@trakwyn.app',
  name: 'Demo User',
  timezone: null,
  targetRole: null,
  avatarUrl: null,
  backupEmail: null,
  backupEmailVerifiedAt: null,
};

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseUploadAvatar.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseRemoveAvatar.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseRequestEmailChange.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseRequestAddBackupEmail.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseRemoveBackupEmail.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    mockedUseStepUpReauth.mockReturnValue({ withStepUp: passThrough, dialog: null } as never);
  });

  it('shows the profile and saves edits', async () => {
    const mutate = jest.fn();
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId, getByText } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByText('demo@trakwyn.app')).toBeTruthy());

    await fireEvent.changeText(getByTestId('profile-name-input'), 'New Name');
    await fireEvent.press(getByTestId('profile-save-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Name' }),
      expect.any(Object),
    );
  });

  it('shows an avatar placeholder and uploads a photo', async () => {
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    const mutate = jest.fn();
    mockedUseUploadAvatar.mockReturnValue({ mutate, isPending: false } as never);
    mockedGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///avatar.jpg', name: 'avatar.jpg', mimeType: 'image/jpeg', size: 2048 },
      ],
    } as never);

    const { getByTestId } = await render(<ProfileScreen />);

    expect(getByTestId('profile-avatar-placeholder')).toBeTruthy();

    await fireEvent.press(getByTestId('profile-upload-avatar-button'));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg' }),
        expect.any(Object),
      ),
    );
  });

  it('shows the avatar image and a remove option when one is set', async () => {
    mockedUseProfile.mockReturnValue({
      data: { ...profile, avatarUrl: 'https://cdn.example.com/avatar.jpg' },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    const mutate = jest.fn();
    mockedUseRemoveAvatar.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<ProfileScreen />);

    expect(getByTestId('profile-avatar-image')).toBeTruthy();

    await fireEvent.press(getByTestId('profile-remove-avatar-button'));

    expect(mutate).toHaveBeenCalled();
  });

  it('places a target role placeholder', async () => {
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByTestId } = await render(<ProfileScreen />);

    expect(getByTestId('profile-target-role-input').props.placeholder).toBe(
      'e.g. Senior Product Designer',
    );
  });

  it('opens a searchable timezone picker and selects a zone', async () => {
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByTestId, getByText, queryByTestId } = await render(<ProfileScreen />);

    await fireEvent.press(getByTestId('profile-timezone-input'));
    await fireEvent.changeText(getByTestId('timezone-search-input'), 'Tokyo');

    await waitFor(() => expect(getByText('Asia/Tokyo')).toBeTruthy());
    await fireEvent.press(getByTestId('timezone-option-Asia/Tokyo'));

    await waitFor(() => expect(queryByTestId('timezone-search-input')).toBeNull());
    expect(getByText('Asia/Tokyo')).toBeTruthy();
  });

  it('requests an email change with the current password', async () => {
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    const mutateAsync = jest.fn().mockResolvedValue({});
    mockedUseRequestEmailChange.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByTestId('profile-email-current-password-input'), 'pw');
    await fireEvent.changeText(getByTestId('profile-new-email-input'), 'new@example.com');
    await fireEvent.press(getByTestId('profile-update-email-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        currentPassword: 'pw',
        newEmail: 'new@example.com',
      }),
    );
    await findByText('Confirmation email sent.');
  });

  it('adds a backup email when none is set', async () => {
    mockedUseProfile.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    const mutateAsync = jest.fn().mockResolvedValue({});
    mockedUseRequestAddBackupEmail.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByTestId('profile-backup-email-input'), 'backup@example.com');
    await fireEvent.changeText(getByTestId('profile-backup-email-password-input'), 'pw');
    await fireEvent.press(getByTestId('profile-add-backup-email-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        currentPassword: 'pw',
        backupEmail: 'backup@example.com',
      }),
    );
  });

  it('shows the existing backup email with an option to remove it', async () => {
    mockedUseProfile.mockReturnValue({
      data: { ...profile, backupEmail: 'backup@example.com', backupEmailVerifiedAt: null },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateProfile.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    const mutateAsync = jest.fn().mockResolvedValue({});
    mockedUseRemoveBackupEmail.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, getByText } = await render(<ProfileScreen />);

    expect(getByText(/backup@example\.com/)).toBeTruthy();

    await fireEvent.changeText(getByTestId('profile-remove-backup-email-password-input'), 'pw');
    await fireEvent.press(getByTestId('profile-remove-backup-email-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('pw'));
  });
});
