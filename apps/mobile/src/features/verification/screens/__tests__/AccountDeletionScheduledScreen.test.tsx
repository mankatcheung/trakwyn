import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../hooks/useEmailVerification', () => ({ useCancelAccountDeletion: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useAuth } from '../../../../auth/AuthContext';
import { useCancelAccountDeletion } from '../../hooks/useEmailVerification';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { AccountDeletionScheduledScreen } from '../AccountDeletionScheduledScreen';

const DATE = '2026-11-12T12:00:00.000Z';

describe('AccountDeletionScheduledScreen (JEF-463)', () => {
  const logout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useAuth).mockReturnValue({ logout } as never);
  });

  it('shows when the account will be deleted', async () => {
    jest.mocked(useCancelAccountDeletion).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);

    const { getByText } = await render(
      <AccountDeletionScheduledScreen deletionScheduledAt={DATE} />,
    );

    expect(getByText(/permanently deleted on .*2026/)).toBeTruthy();
  });

  it('cancels the deletion when asked', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ cancelAccountDeletion: true });
    jest
      .mocked(useCancelAccountDeletion)
      .mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await render(
      <AccountDeletionScheduledScreen deletionScheduledAt={DATE} />,
    );
    await fireEvent.press(getByTestId('cancel-account-deletion-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(logout).not.toHaveBeenCalled();
  });

  it('shows the error when cancelling fails', async () => {
    const mutateAsync = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('fail'), {
          response: { errors: [{ message: 'Try again later' }] },
        }),
      );
    jest
      .mocked(useCancelAccountDeletion)
      .mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByText } = await render(
      <AccountDeletionScheduledScreen deletionScheduledAt={DATE} />,
    );
    await fireEvent.press(getByTestId('cancel-account-deletion-button'));

    await findByText('Try again later');
  });

  it('signs out instead, if asked', async () => {
    jest.mocked(useCancelAccountDeletion).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);

    const { getByTestId } = await render(
      <AccountDeletionScheduledScreen deletionScheduledAt={DATE} />,
    );
    await fireEvent.press(getByTestId('account-deletion-sign-out-button'));

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
