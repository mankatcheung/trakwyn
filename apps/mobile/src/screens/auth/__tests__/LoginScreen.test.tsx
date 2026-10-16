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
import { LoginScreen } from '../LoginScreen';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<LoginScreen />);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('submits email and password to login', async () => {
    const login = jest.fn().mockResolvedValue({ totpRequired: false });
    mockedUseAuth.mockReturnValue({
      login,
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('login-email-input'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    await fireEvent.press(getByTestId('login-submit-button'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('user@example.com', 'password123'));
  });

  it('shows a validation error instead of calling login when the email is invalid', async () => {
    const login = jest.fn();
    mockedUseAuth.mockReturnValue({
      login,
      loginWithTotp: jest.fn(),
      loginWithOAuth: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByText } = await renderScreen();

    await fireEvent.changeText(getByTestId('login-email-input'), 'not-an-email');
    await fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    await fireEvent.press(getByTestId('login-submit-button'));

    await findByText('Enter a valid email address');
    expect(login).not.toHaveBeenCalled();
  });

  it('navigates to register when the create-account link is pressed', async () => {
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

    // By testID rather than by its label: .maestro/01-register-and-create-application.yml
    // taps this link by that id to reach the register screen, so a rename has
    // to fail here first (JEF-300, R-5).
    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('login-register-link'));

    expect(push).toHaveBeenCalledWith('/register');
  });

  it('switches to the TOTP step when login reports totpRequired', async () => {
    const login = jest.fn().mockResolvedValue({ totpRequired: true });
    const loginWithTotp = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      login,
      loginWithTotp,
      loginWithOAuth: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      isLoading: false,
      isAuthenticated: false,
      sessionExpired: false,
      reauthenticate: jest.fn(),
    });

    const { getByTestId, findByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('login-email-input'), 'user@example.com');
    await fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    await fireEvent.press(getByTestId('login-submit-button'));

    const codeInput = await findByTestId('totp-code-input');
    await fireEvent.changeText(codeInput, '123456');
    await fireEvent.press(getByTestId('totp-submit-button'));

    await waitFor(() =>
      expect(loginWithTotp).toHaveBeenCalledWith('user@example.com', 'password123', '123456'),
    );
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

  it('shows an error message when the OAuth flow fails', async () => {
    const loginWithOAuth = jest.fn().mockRejectedValue(new Error('That sign-in link has expired.'));
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

    await fireEvent.press(getByTestId('oauth-google-button'));

    await findByText('That sign-in link has expired.');
  });
});
