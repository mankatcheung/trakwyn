import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: jest.fn(),
  useUpdateNotificationPreferences: jest.fn(),
}));
jest.mock('../../../push/hooks/usePushToken', () => ({
  useEnablePushNotifications: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../hooks/useNotificationPreferences';
import { useEnablePushNotifications } from '../../../push/hooks/usePushToken';
import { PushRegistrationError } from '../../../push/lib/registerForPushNotifications';
import { NotificationsScreen } from '../NotificationsScreen';
import type { NotificationPreferences } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUsePreferences = jest.mocked(useNotificationPreferences);
const mockedUseUpdatePreferences = jest.mocked(useUpdateNotificationPreferences);
const mockedUseEnablePush = jest.mocked(useEnablePushNotifications);
const mockedUseTheme = jest.mocked(useTheme);

const preferences: NotificationPreferences = {
  digestFrequency: 'WEEKLY',
  followUpRemindersEnabled: true,
  pushNotificationsEnabled: false,
  weeklyApplicationGoal: 5,
};

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseEnablePush.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
  });

  it('saves the new digest frequency when a chip is pressed', async () => {
    const mutate = jest.fn();
    mockedUsePreferences.mockReturnValue({
      data: preferences,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdatePreferences.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<NotificationsScreen />);

    await waitFor(() => expect(getByTestId('digest-off')).toBeTruthy());
    await fireEvent.press(getByTestId('digest-off'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ digestFrequency: 'OFF' }),
      expect.any(Object),
    );
  });

  it('toggles follow-up reminders', async () => {
    const mutate = jest.fn();
    mockedUsePreferences.mockReturnValue({
      data: preferences,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdatePreferences.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await render(<NotificationsScreen />);

    await fireEvent(getByTestId('follow-up-reminders-switch'), 'valueChange', false);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ followUpRemindersEnabled: false }),
      expect.any(Object),
    );
  });

  it('registers for push notifications and saves the preference when the toggle is turned on', async () => {
    const mutate = jest.fn();
    const enablePush = jest.fn((_vars, options) => options?.onSuccess?.());
    mockedUsePreferences.mockReturnValue({
      data: preferences,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdatePreferences.mockReturnValue({ mutate, isPending: false } as never);
    mockedUseEnablePush.mockReturnValue({ mutate: enablePush, isPending: false } as never);

    const { getByTestId } = await render(<NotificationsScreen />);

    await fireEvent(getByTestId('push-notifications-switch'), 'valueChange', true);

    expect(enablePush).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ pushNotificationsEnabled: true }),
      expect.any(Object),
    );
  });

  it('turns push notifications off without calling the registration flow', async () => {
    const mutate = jest.fn();
    const enablePush = jest.fn();
    mockedUsePreferences.mockReturnValue({
      data: { ...preferences, pushNotificationsEnabled: true },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdatePreferences.mockReturnValue({ mutate, isPending: false } as never);
    mockedUseEnablePush.mockReturnValue({ mutate: enablePush, isPending: false } as never);

    const { getByTestId } = await render(<NotificationsScreen />);

    await fireEvent(getByTestId('push-notifications-switch'), 'valueChange', false);

    expect(enablePush).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ pushNotificationsEnabled: false }),
      expect.any(Object),
    );
  });

  it('shows an error and leaves the toggle off when registration fails', async () => {
    const mutate = jest.fn();
    const enablePush = jest.fn((_vars, options) =>
      options?.onError?.(
        new PushRegistrationError('Push notifications require a physical device.'),
      ),
    );
    mockedUsePreferences.mockReturnValue({
      data: preferences,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdatePreferences.mockReturnValue({ mutate, isPending: false } as never);
    mockedUseEnablePush.mockReturnValue({ mutate: enablePush, isPending: false } as never);

    const { getByTestId, findByText } = await render(<NotificationsScreen />);

    await fireEvent(getByTestId('push-notifications-switch'), 'valueChange', true);

    await findByText('Push notifications require a physical device.');
    expect(mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ pushNotificationsEnabled: true }),
      expect.any(Object),
    );
  });
});
