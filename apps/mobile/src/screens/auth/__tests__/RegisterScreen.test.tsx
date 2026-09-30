import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../i18n';

jest.mock('../../../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import { useAuth } from '../../../auth/AuthContext';
import { RegisterScreen } from '../RegisterScreen';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<RegisterScreen />);
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('submits email and password to register when passwords match', async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register,
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('register-email-input'), 'user@example.com');
    await fireEvent.changeText(getByTestId('register-password-input'), 'password123');
    await fireEvent.changeText(getByTestId('register-confirm-password-input'), 'password123');
    await fireEvent.press(getByTestId('register-submit-button'));

    await waitFor(() => expect(register).toHaveBeenCalledWith('user@example.com', 'password123'));
  });

  it('shows a validation error instead of calling register when passwords do not match', async () => {
    const register = jest.fn();
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register,
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByText } = await renderScreen();

    await fireEvent.changeText(getByTestId('register-email-input'), 'user@example.com');
    await fireEvent.changeText(getByTestId('register-password-input'), 'password123');
    await fireEvent.changeText(getByTestId('register-confirm-password-input'), 'password456');
    await fireEvent.press(getByTestId('register-submit-button'));

    await findByText('Passwords do not match');
    expect(register).not.toHaveBeenCalled();
  });

  it('shows a validation error instead of calling register when the email is invalid', async () => {
    const register = jest.fn();
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register,
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByText } = await renderScreen();

    await fireEvent.changeText(getByTestId('register-email-input'), 'not-an-email');
    await fireEvent.changeText(getByTestId('register-password-input'), 'password123');
    await fireEvent.changeText(getByTestId('register-confirm-password-input'), 'password123');
    await fireEvent.press(getByTestId('register-submit-button'));

    await findByText('Enter a valid email address');
    expect(register).not.toHaveBeenCalled();
  });

  it('navigates to login when the sign in link is pressed', async () => {
    const push = jest.fn();
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    // By testID rather than by its label: the Maestro flows in .maestro/ tap
    // this link by that id, so a rename has to fail here first (JEF-300, R-5).
    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('register-login-link'));

    expect(push).toHaveBeenCalledWith('/login');
  });

  it('starts the Google OAuth flow when its button is pressed', async () => {
    const loginWithOAuth = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth,
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByText } = await renderScreen();

    await findByText('Google');
    await fireEvent.press(getByTestId('oauth-google-button'));

    await waitFor(() => expect(loginWithOAuth).toHaveBeenCalledWith('google'));
  });

  it('starts the GitHub OAuth flow when its button is pressed', async () => {
    const loginWithOAuth = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      login: jest.fn(),
      loginWithTotp: jest.fn(),
      loginWithOAuth,
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByText } = await renderScreen();

    await findByText('GitHub');
    await fireEvent.press(getByTestId('oauth-github-button'));

    await waitFor(() => expect(loginWithOAuth).toHaveBeenCalledWith('github'));
  });
});
