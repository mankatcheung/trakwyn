import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useRequestAccountDeletion', () => ({
  useRequestAccountDeletion: jest.fn(),
}));
jest.mock('../../../verification/hooks/useEmailVerification', () => ({
  useEmailVerification: jest.fn(),
}));
jest.mock('../../../../auth/useStepUpReauth', () => ({
  StepUpCancelledError: class StepUpCancelledError extends Error {},
  // Runs the call as is: the step-up hook has its own tests.
  useStepUpReauth: () => ({ withStepUp: (fn: () => Promise<unknown>) => fn(), dialog: null }),
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useRequestAccountDeletion } from '../../hooks/useRequestAccountDeletion';
import { useEmailVerification } from '../../../verification/hooks/useEmailVerification';
import { DangerZoneScreen } from '../DangerZoneScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const EMAIL = 'jeff@example.com';
const mockedUseRequestAccountDeletion = jest.mocked(useRequestAccountDeletion);

describe('DangerZoneScreen (JEF-463)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useEmailVerification).mockReturnValue({
      data: { email: EMAIL, emailVerified: true, deletionScheduledAt: null },
    } as never);
  });

  it('keeps the button off until the account email is typed, and asks for no password', async () => {
    mockedUseRequestAccountDeletion.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);

    const { getByTestId, queryByTestId } = await render(<DangerZoneScreen />);

    expect(queryByTestId('delete-account-password-input')).toBeNull();
    expect(getByTestId('delete-account-button')).toBeDisabled();
    await fireEvent.changeText(getByTestId('delete-account-email-input'), 'someone@else.com');
    expect(getByTestId('delete-account-button')).toBeDisabled();
    await fireEvent.changeText(getByTestId('delete-account-email-input'), ' JEFF@example.com ');
    expect(getByTestId('delete-account-button')).toBeEnabled();
  });

  it('requests the deletion and says to check the inbox', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ requestAccountDeletion: true });
    mockedUseRequestAccountDeletion.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByTestId } = await render(<DangerZoneScreen />);

    await fireEvent.changeText(getByTestId('delete-account-email-input'), EMAIL);
    await fireEvent.press(getByTestId('delete-account-button'));

    expect(await findByTestId('delete-account-request-sent')).toHaveTextContent(
      new RegExp(`Check ${EMAIL}`),
    );
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the API's message when the request is refused", async () => {
    const mutateAsync = jest.fn().mockRejectedValue(
      Object.assign(new Error('fail'), {
        response: { errors: [{ message: 'We could not send the confirmation email.' }] },
      }),
    );
    mockedUseRequestAccountDeletion.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByText, queryByTestId } = await render(<DangerZoneScreen />);

    await fireEvent.changeText(getByTestId('delete-account-email-input'), EMAIL);
    await fireEvent.press(getByTestId('delete-account-button'));

    await findByText('We could not send the confirmation email.');
    await waitFor(() => expect(queryByTestId('delete-account-request-sent')).toBeNull());
  });
});
