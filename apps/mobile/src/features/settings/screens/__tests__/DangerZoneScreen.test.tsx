import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../hooks/useDeleteAccount', () => ({ useDeleteAccount: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useAuth } from '../../../../auth/AuthContext';
import { useDeleteAccount } from '../../hooks/useDeleteAccount';
import { DangerZoneScreen } from '../DangerZoneScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseDeleteAccount = jest.mocked(useDeleteAccount);
const mockedUseTheme = jest.mocked(useTheme);

describe('DangerZoneScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  beforeEach(() => jest.clearAllMocks());

  it('deletes the account and logs out on success', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ deleteAccount: true });
    const logout = jest.fn();
    mockedUseDeleteAccount.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseAuth.mockReturnValue({ logout } as never);

    const { getByTestId } = await render(<DangerZoneScreen />);

    await fireEvent.changeText(getByTestId('delete-account-password-input'), 'password123');
    await fireEvent.press(getByTestId('delete-account-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('password123'));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('shows an error message and does not log out when deletion fails', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(
      Object.assign(new Error('fail'), {
        response: { errors: [{ message: 'Incorrect password' }] },
      }),
    );
    const logout = jest.fn();
    mockedUseDeleteAccount.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseAuth.mockReturnValue({ logout } as never);

    const { getByTestId, findByText } = await render(<DangerZoneScreen />);

    await fireEvent.changeText(getByTestId('delete-account-password-input'), 'wrong');
    await fireEvent.press(getByTestId('delete-account-button'));

    await findByText('Incorrect password');
    expect(logout).not.toHaveBeenCalled();
  });

  it('disables the delete button until a password is entered', async () => {
    mockedUseDeleteAccount.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedUseAuth.mockReturnValue({ logout: jest.fn() } as never);

    const { getByTestId } = await render(<DangerZoneScreen />);

    expect(getByTestId('delete-account-button').props.accessibilityState?.disabled).toBe(true);
  });
});
