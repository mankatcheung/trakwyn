import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../hooks/useProfile', () => ({ useProfile: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../../auth/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { SettingsScreen } from '../SettingsScreen';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseProfile = jest.mocked(useProfile);

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseProfile.mockReturnValue({
      data: {
        id: '1',
        email: 'demo@trakwyn.app',
        name: 'Demo User',
        timezone: null,
        targetRole: null,
        avatarUrl: null,
        backupEmail: null,
        backupEmailVerifiedAt: null,
      },
    } as never);
  });

  it('navigates to each settings section', async () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({ push } as never);
    mockedUseAuth.mockReturnValue({ logout: jest.fn() } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-profile-row'));
    expect(push).toHaveBeenCalledWith('/settings/profile');

    await fireEvent.press(getByTestId('settings-security-row'));
    expect(push).toHaveBeenCalledWith('/settings/security');

    await fireEvent.press(getByTestId('settings-appearance-row'));
    expect(push).toHaveBeenCalledWith('/settings/appearance');

    await fireEvent.press(getByTestId('settings-language-row'));
    expect(push).toHaveBeenCalledWith('/settings/language');

    await fireEvent.press(getByTestId('settings-ai-row'));
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('navigates to the new settings sections', async () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({ push } as never);
    mockedUseAuth.mockReturnValue({ logout: jest.fn() } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-experience-row'));
    expect(push).toHaveBeenCalledWith('/settings/experience');

    await fireEvent.press(getByTestId('settings-integrations-row'));
    expect(push).toHaveBeenCalledWith('/settings/integrations');

    await fireEvent.press(getByTestId('settings-data-row'));
    expect(push).toHaveBeenCalledWith('/settings/data');

    await fireEvent.press(getByTestId('settings-danger-zone-row'));
    expect(push).toHaveBeenCalledWith('/settings/danger-zone');
  });

  it('navigates to analytics and trash, relocated here from the old sidebar', async () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({ push } as never);
    mockedUseAuth.mockReturnValue({ logout: jest.fn() } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-analytics-row'));
    expect(push).toHaveBeenCalledWith('/settings/analytics');

    await fireEvent.press(getByTestId('settings-trash-row'));
    expect(push).toHaveBeenCalledWith('/settings/trash');
  });

  it('opens the legal pages in the browser', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseAuth.mockReturnValue({ logout: jest.fn() } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-privacy-policy-row'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/privacy$/));

    await fireEvent.press(getByTestId('settings-terms-of-service-row'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/terms$/));

    await fireEvent.press(getByTestId('settings-accessibility-row'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/accessibility$/));

    openURL.mockRestore();
  });

  it('signs out when the sign-out row is pressed', async () => {
    const logout = jest.fn();
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseAuth.mockReturnValue({ logout } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-signout-button'));

    expect(logout).toHaveBeenCalled();
  });
});
