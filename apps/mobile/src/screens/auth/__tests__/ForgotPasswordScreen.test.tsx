import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../i18n';

jest.mock('../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import { gqlRequest } from '../../../graphql/client';
import { ForgotPasswordScreen } from '../ForgotPasswordScreen';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<ForgotPasswordScreen />);
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('requests a password reset for the primary email and shows a success message', async () => {
    mockedGqlRequest.mockResolvedValue({ requestPasswordReset: true });

    const { getByTestId, findByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('forgot-password-email-input'), 'user@example.com');
    await fireEvent.press(getByTestId('forgot-password-submit-button'));

    await findByTestId('forgot-password-success');
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestPasswordReset'), {
      email: 'user@example.com',
    });
  });

  it('shows a validation error instead of submitting when the email is invalid', async () => {
    const { getByTestId, findByText } = await renderScreen();

    await fireEvent.changeText(getByTestId('forgot-password-email-input'), 'not-an-email');
    await fireEvent.press(getByTestId('forgot-password-submit-button'));

    await findByText('Enter a valid email address');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('switches to backup-email recovery and calls the backup mutation', async () => {
    mockedGqlRequest.mockResolvedValue({ requestBackupEmailRecovery: true });

    const { getByText, getByTestId, findByTestId } = await renderScreen();

    await fireEvent.press(getByText('Use backup email instead'));
    await fireEvent.changeText(getByTestId('forgot-password-email-input'), 'backup@example.com');
    await fireEvent.press(getByTestId('forgot-password-submit-button'));

    await findByTestId('forgot-password-success');
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('RequestBackupEmailRecovery'),
      { backupEmail: 'backup@example.com' },
    );
  });

  it('navigates back to sign in', async () => {
    const push = jest.fn();
    const { getByText } = await renderScreen(push);

    await fireEvent.press(getByText('Back to sign in'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});
