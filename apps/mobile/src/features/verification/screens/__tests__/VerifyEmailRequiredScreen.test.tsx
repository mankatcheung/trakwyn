import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useEmailVerification', () => ({
  useEmailVerification: jest.fn(),
  useResendVerificationEmail: jest.fn(),
}));
jest.mock('../../../settings/hooks/useProfile', () => ({ useRequestEmailChange: jest.fn() }));
jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useEmailVerification, useResendVerificationEmail } from '../../hooks/useEmailVerification';
import { useRequestEmailChange } from '../../../settings/hooks/useProfile';
import { useAuth } from '../../../../auth/AuthContext';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { RESEND_COOLDOWN_SECONDS, VerifyEmailRequiredScreen } from '../VerifyEmailRequiredScreen';

const refetch = jest.fn();
const resendMutateAsync = jest.fn();
const changeMutateAsync = jest.fn();
const logout = jest.fn();

const renderScreen = () => render(<VerifyEmailRequiredScreen email="new@example.com" />);

describe('VerifyEmailRequiredScreen (JEF-438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useAuth).mockReturnValue({ logout } as never);
    jest.mocked(useEmailVerification).mockReturnValue({ refetch } as never);
    jest
      .mocked(useResendVerificationEmail)
      .mockReturnValue({ mutateAsync: resendMutateAsync, isPending: false } as never);
    jest
      .mocked(useRequestEmailChange)
      .mockReturnValue({ mutateAsync: changeMutateAsync, isPending: false } as never);
    resendMutateAsync.mockResolvedValue({ resendVerificationEmail: true });
    changeMutateAsync.mockResolvedValue({ requestEmailChange: true });
    refetch.mockResolvedValue({ data: { email: 'new@example.com', emailVerified: false } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tells the user which address the link went to and to check spam', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Verify your email to continue')).toBeTruthy();
    expect(getByText(/new@example\.com/)).toBeTruthy();
    expect(getByText(/check your spam folder/i)).toBeTruthy();
  });

  describe('resend', () => {
    it('sends a link, confirms it, and holds the button for the cooldown', async () => {
      jest.useFakeTimers();
      const { getByTestId, getByText } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-resend'));

      await waitFor(() =>
        expect(getByText('A new link is on its way to new@example.com.')).toBeTruthy(),
      );
      expect(resendMutateAsync).toHaveBeenCalledTimes(1);
      expect(getByText(`Resend in ${RESEND_COOLDOWN_SECONDS}s`)).toBeTruthy();
      expect(getByTestId('verify-email-resend').props.accessibilityState?.disabled).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000);
      });
      expect(getByText('Resend verification email')).toBeTruthy();
    });

    it('says to wait when the API rate-limits the resend', async () => {
      resendMutateAsync.mockRejectedValue({
        response: { errors: [{ message: 'Too many', extensions: { code: 'RATE_LIMITED' } }] },
      });
      const { getByTestId, findByText } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-resend'));

      expect(await findByText(/wait a few minutes before trying again/i)).toBeTruthy();
    });

    it('shows a generic failure for any other error', async () => {
      resendMutateAsync.mockRejectedValue(new Error('boom'));
      const { getByTestId, findByText } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-resend'));

      expect(await findByText("We couldn't send the email. Please try again.")).toBeTruthy();
    });
  });

  describe('checking again', () => {
    it('says so when the email is still not verified', async () => {
      const { getByTestId, findByText } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-check'));

      expect(await findByText(/isn't verified yet/i)).toBeTruthy();
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('shows nothing extra once verified (the layout swaps the screen away)', async () => {
      refetch.mockResolvedValue({ data: { email: 'new@example.com', emailVerified: true } });
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-check'));

      await waitFor(() => expect(refetch).toHaveBeenCalled());
      expect(queryByTestId('verify-email-notice')).toBeNull();
    });
  });

  describe('using a different email', () => {
    it('sends the trimmed new address and the password to the email-change mutation', async () => {
      const { getByTestId, findByText, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-change'));
      await fireEvent.changeText(getByTestId('verify-email-new-email'), '  right@example.com ');
      await fireEvent.changeText(getByTestId('verify-email-password'), 'hunter2hunter2');
      await fireEvent.press(getByTestId('verify-email-change-submit'));

      expect(
        await findByText('Check right@example.com for a link to confirm the new address.'),
      ).toBeTruthy();
      expect(changeMutateAsync).toHaveBeenCalledWith({
        currentPassword: 'hunter2hunter2',
        newEmail: 'right@example.com',
      });
      expect(queryByTestId('verify-email-new-email')).toBeNull();
    });

    it("shows the server's message when the change is refused", async () => {
      changeMutateAsync.mockRejectedValue({
        response: { errors: [{ message: 'Invalid password' }] },
      });
      const { getByTestId, findByText } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-change'));
      await fireEvent.changeText(getByTestId('verify-email-new-email'), 'right@example.com');
      await fireEvent.changeText(getByTestId('verify-email-password'), 'wrong');
      await fireEvent.press(getByTestId('verify-email-change-submit'));

      expect(await findByText('Invalid password')).toBeTruthy();
    });

    it('closes the form on cancel', async () => {
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('verify-email-change'));
      await fireEvent.press(getByTestId('verify-email-change-cancel'));

      expect(queryByTestId('verify-email-new-email')).toBeNull();
    });
  });

  it('signs out', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('verify-email-sign-out'));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
