import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

import { useRouter } from 'expo-router';
import { useAuth } from '../../../../auth/AuthContext';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { SettingsScreen } from '../SettingsScreen';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
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

  it('signs out when the sign-out row is pressed', async () => {
    const logout = jest.fn();
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseAuth.mockReturnValue({ logout } as never);

    const { getByTestId } = await render(<SettingsScreen />);

    await fireEvent.press(getByTestId('settings-signout-button'));

    expect(logout).toHaveBeenCalled();
  });
});
