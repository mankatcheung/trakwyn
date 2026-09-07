import '../../../../i18n';

jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } }, easConfig: null },
}));

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {
  PushRegistrationError,
  registerForPushNotifications,
} from '../registerForPushNotifications';

const mockedDevice = jest.mocked(Device, { shallow: true });
const mockedNotifications = jest.mocked(Notifications, { shallow: true });
const mockedConstants = jest.mocked(Constants);

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedDevice as { isDevice: boolean }).isDevice = true;
    mockedConstants.expoConfig = { extra: { eas: { projectId: 'test-project-id' } } } as never;
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as never);
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[abc123]',
    } as never);
  });

  it('returns an Expo push token when permission is already granted', async () => {
    await expect(registerForPushNotifications()).resolves.toBe('ExponentPushToken[abc123]');
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'test-project-id',
    });
  });

  it('requests permission when not already granted', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValueOnce({
      status: 'undetermined',
    } as never);

    await expect(registerForPushNotifications()).resolves.toBe('ExponentPushToken[abc123]');
    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('throws when not on a physical device', async () => {
    (mockedDevice as { isDevice: boolean }).isDevice = false;

    await expect(registerForPushNotifications()).rejects.toThrow(PushRegistrationError);
  });

  it('throws when permission is denied', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);
    mockedNotifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
    } as never);

    await expect(registerForPushNotifications()).rejects.toThrow('permission was not granted');
  });

  it('throws when no EAS project is configured', async () => {
    mockedConstants.expoConfig = { extra: {} } as never;

    await expect(registerForPushNotifications()).rejects.toThrow('no EAS project configured');
  });

  it('wraps a token-fetch failure in a PushRegistrationError', async () => {
    mockedNotifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('network down'));

    await expect(registerForPushNotifications()).rejects.toThrow('network down');
  });
});
