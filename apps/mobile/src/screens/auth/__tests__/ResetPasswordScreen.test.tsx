import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../i18n';

jest.mock('../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), useLocalSearchParams: jest.fn() }));

jest.mock('../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { gqlRequest } from '../../../graphql/client';
import { ResetPasswordScreen } from '../ResetPasswordScreen';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(token: string | undefined, push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  mockedUseLocalSearchParams.mockReturnValue({ token } as never);
  return render(<ResetPasswordScreen />);
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('shows an invalid-link message when there is no token', async () => {
    const { findByTestId } = await renderScreen(undefined);

    await findByTestId('reset-password-invalid-link');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('submits the new password with the token and shows success', async () => {
    mockedGqlRequest.mockResolvedValue({ resetPassword: true });

    const { getByTestId, findByTestId } = await renderScreen('reset-token-123');

    await fireEvent.changeText(getByTestId('reset-password-new-input'), 'newpassword123');
    await fireEvent.changeText(getByTestId('reset-password-confirm-input'), 'newpassword123');
    await fireEvent.press(getByTestId('reset-password-submit-button'));

    await findByTestId('reset-password-success');
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ResetPassword'), {
      token: 'reset-token-123',
      newPassword: 'newpassword123',
    });
  });

  it('shows a validation error when the passwords do not match', async () => {
    const { getByTestId, findByText } = await renderScreen('reset-token-123');

    await fireEvent.changeText(getByTestId('reset-password-new-input'), 'newpassword123');
    await fireEvent.changeText(getByTestId('reset-password-confirm-input'), 'different123');
    await fireEvent.press(getByTestId('reset-password-submit-button'));

    await findByText('Passwords do not match');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('surfaces a server error message when the mutation fails', async () => {
    mockedGqlRequest.mockRejectedValue(
      Object.assign(new Error('fail'), {
        response: { errors: [{ message: 'Token expired' }] },
      }),
    );

    const { getByTestId, findByText } = await renderScreen('reset-token-123');

    await fireEvent.changeText(getByTestId('reset-password-new-input'), 'newpassword123');
    await fireEvent.changeText(getByTestId('reset-password-confirm-input'), 'newpassword123');
    await fireEvent.press(getByTestId('reset-password-submit-button'));

    await findByText('Token expired');
  });

  it('navigates back to sign in', async () => {
    const push = jest.fn();
    const { getByText } = await renderScreen('reset-token-123', push);

    await fireEvent.press(getByText('Back to sign in'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});
