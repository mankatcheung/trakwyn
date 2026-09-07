import React from 'react';
import { Alert, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useSessions', () => ({
  useSessions: jest.fn(),
  useRevokeSession: jest.fn(),
  useRevokeOtherSessions: jest.fn(),
  useUpdatePassword: jest.fn(),
}));
jest.mock('../../hooks/useLinkedOAuthAccounts', () => ({
  useLinkedOAuthAccounts: jest.fn(),
  useUnlinkOAuthAccount: jest.fn(),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../auth/useStepUpReauth', () => {
  class StepUpCancelledError extends Error {}
  return { StepUpCancelledError, useStepUpReauth: jest.fn() };
});

import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
  useUpdatePassword,
} from '../../hooks/useSessions';
import { useLinkedOAuthAccounts, useUnlinkOAuthAccount } from '../../hooks/useLinkedOAuthAccounts';
import { StepUpCancelledError, useStepUpReauth } from '../../../../auth/useStepUpReauth';
import { SecurityScreen } from '../SecurityScreen';
import type { LinkedOAuthAccount, Session } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseSessions = jest.mocked(useSessions);
const mockedUseRevokeSession = jest.mocked(useRevokeSession);
const mockedUseRevokeOtherSessions = jest.mocked(useRevokeOtherSessions);
const mockedUseUpdatePassword = jest.mocked(useUpdatePassword);
const mockedUseStepUpReauth = jest.mocked(useStepUpReauth);
const mockedUseLinkedOAuthAccounts = jest.mocked(useLinkedOAuthAccounts);
const mockedUseUnlinkOAuthAccount = jest.mocked(useUnlinkOAuthAccount);
const mockedUseTheme = jest.mocked(useTheme);

const currentSession: Session = {
  id: '1',
  userAgent: 'iOS App',
  ipAddress: '1.2.3.4',
  deviceLabel: "Jeff's iPhone",
  location: 'London, UK',
  lastUsedAt: '2026-01-01T00:00:00.000Z',
  current: true,
};
const otherSession: Session = {
  ...currentSession,
  id: '2',
  current: false,
  deviceLabel: 'Chrome on Mac',
};

const passThrough = <T,>(fn: () => Promise<T>) => fn();

const googleAccount: LinkedOAuthAccount = {
  provider: 'google',
  email: 'jeff@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('SecurityScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseSessions.mockReturnValue({
      data: [currentSession],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseRevokeSession.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseRevokeOtherSessions.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseUpdatePassword.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(true),
      isPending: false,
    } as never);
    mockedUseStepUpReauth.mockReturnValue({ withStepUp: passThrough, dialog: null });
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUnlinkOAuthAccount.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      variables: undefined,
    } as never);
  });

  it('lists sessions and revokes a non-current one', async () => {
    const revoke = jest.fn();
    mockedUseSessions.mockReturnValue({
      data: [currentSession, otherSession],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseRevokeSession.mockReturnValue({ mutate: revoke, isPending: false } as never);

    const { getByTestId, queryByTestId, getByText } = await render(<SecurityScreen />);

    await waitFor(() => expect(getByText('Chrome on Mac')).toBeTruthy());
    expect(queryByTestId('revoke-session-1')).toBeNull();

    await fireEvent.press(getByTestId('revoke-session-2'));

    expect(revoke).toHaveBeenCalledWith('2', expect.any(Object));
  });

  it('updates the password through the step-up wrapper and confirms', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(true);
    const withStepUp = jest.fn(passThrough);
    mockedUseUpdatePassword.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseStepUpReauth.mockReturnValue({ withStepUp, dialog: null } as never);

    const { getByTestId, getByText } = await render(<SecurityScreen />);

    await fireEvent.changeText(getByTestId('current-password-input'), 'old-password');
    await fireEvent.changeText(getByTestId('new-password-input'), 'new-password-1');
    await fireEvent.press(getByTestId('change-password-button'));

    await waitFor(() => expect(getByText('Password updated.')).toBeTruthy());
    expect(withStepUp).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    });
    expect(getByTestId('current-password-input').props.value).toBe('');
    expect(getByTestId('new-password-input').props.value).toBe('');
  });

  it('rejects a short new password before calling the API', async () => {
    const mutateAsync = jest.fn();
    mockedUseUpdatePassword.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, getByText } = await render(<SecurityScreen />);

    await fireEvent.changeText(getByTestId('current-password-input'), 'old-password');
    await fireEvent.changeText(getByTestId('new-password-input'), 'short');
    await fireEvent.press(getByTestId('change-password-button'));

    await waitFor(() =>
      expect(getByText('New password must be at least 8 characters')).toBeTruthy(),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the API's message when the update is rejected", async () => {
    mockedUseUpdatePassword.mockReturnValue({
      mutateAsync: jest
        .fn()
        .mockRejectedValue({ response: { errors: [{ message: 'Invalid password' }] } }),
      isPending: false,
    } as never);

    const { getByTestId, getByText, queryByText } = await render(<SecurityScreen />);

    await fireEvent.changeText(getByTestId('current-password-input'), 'wrong');
    await fireEvent.changeText(getByTestId('new-password-input'), 'new-password-1');
    await fireEvent.press(getByTestId('change-password-button'));

    await waitFor(() => expect(getByText('Invalid password')).toBeTruthy());
    expect(queryByText('Password updated.')).toBeNull();
  });

  it('reports nothing when the step-up prompt is dismissed', async () => {
    mockedUseStepUpReauth.mockReturnValue({
      withStepUp: () => Promise.reject(new StepUpCancelledError()),
      dialog: null,
    });

    const { getByTestId, queryByText } = await render(<SecurityScreen />);

    await fireEvent.changeText(getByTestId('current-password-input'), 'old-password');
    await fireEvent.changeText(getByTestId('new-password-input'), 'new-password-1');
    await fireEvent.press(getByTestId('change-password-button'));

    await waitFor(() => expect(getByTestId('change-password-button')).toBeTruthy());
    expect(queryByText('Password updated.')).toBeNull();
    expect(queryByText(/went wrong/)).toBeNull();
  });

  it('renders the step-up prompt the hook hands back', async () => {
    mockedUseStepUpReauth.mockReturnValue({
      withStepUp: passThrough,
      dialog: <Text>step-up-prompt</Text>,
    });

    const { getByText } = await render(<SecurityScreen />);

    expect(getByText('step-up-prompt')).toBeTruthy();
  });

  it('shows a loading indicator while linked accounts are loading', async () => {
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await render(<SecurityScreen />);

    expect(getByTestId('linked-accounts-loading')).toBeTruthy();
  });

  it('renders a linked provider with its email and linked-since date, and an unlinked provider as Not linked', async () => {
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [googleAccount],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId, getByText } = await render(<SecurityScreen />);

    expect(getByText(/jeff@example\.com/)).toBeTruthy();
    expect(getByTestId('unlink-oauth-google')).toBeTruthy();
    expect(getByText('Not linked')).toBeTruthy();
  });

  it('falls back to a generic "Linked" label when the account has no email', async () => {
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [{ ...googleAccount, email: null }],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByText } = await render(<SecurityScreen />);

    expect(getByText(/^Linked ·/)).toBeTruthy();
  });

  it('unlinks a provider after confirmation', async () => {
    const unlinkMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Unlink');
      confirm?.onPress?.();
    });
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [googleAccount],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUnlinkOAuthAccount.mockReturnValue({
      mutate: unlinkMutate,
      isPending: false,
      variables: undefined,
    } as never);

    const { getByTestId } = await render(<SecurityScreen />);

    await fireEvent.press(getByTestId('unlink-oauth-google'));

    expect(unlinkMutate).toHaveBeenCalledWith('google', expect.any(Object));
  });

  it('does not unlink when the confirmation is cancelled', async () => {
    const unlinkMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const cancel = buttons?.find((b) => b.text === 'Cancel');
      cancel?.onPress?.();
    });
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [googleAccount],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUnlinkOAuthAccount.mockReturnValue({
      mutate: unlinkMutate,
      isPending: false,
      variables: undefined,
    } as never);

    const { getByTestId } = await render(<SecurityScreen />);

    await fireEvent.press(getByTestId('unlink-oauth-google'));

    expect(unlinkMutate).not.toHaveBeenCalled();
  });

  it('surfaces an error when unlinking fails', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Unlink');
      confirm?.onPress?.();
    });
    mockedUseLinkedOAuthAccounts.mockReturnValue({
      data: [googleAccount],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    const unlinkMutate = jest.fn((_provider, options) => {
      options?.onError?.({ response: { errors: [{ message: 'Cannot unlink last provider' }] } });
    });
    mockedUseUnlinkOAuthAccount.mockReturnValue({
      mutate: unlinkMutate,
      isPending: false,
      variables: undefined,
    } as never);
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { getByTestId } = await render(<SecurityScreen />);

    await fireEvent.press(getByTestId('unlink-oauth-google'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not unlink', 'Cannot unlink last provider'),
    );
  });
});
