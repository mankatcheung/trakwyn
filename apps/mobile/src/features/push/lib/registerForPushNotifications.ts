import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import i18n from '../../../i18n';

export class PushRegistrationError extends Error {}

/**
 * Requests notification permission and returns an Expo push token, or
 * throws a PushRegistrationError with a user-presentable reason. Expo Go
 * (SDK 53+) no longer supports remote push notifications at all — this only
 * works in a development or production build created via EAS, which is why
 * every failure mode here is handled as a caught, reported error rather
 * than letting a native exception surface.
 */
export async function registerForPushNotifications(): Promise<string> {
  if (!Device.isDevice) {
    throw new PushRegistrationError(i18n.t('push:requiresPhysicalDevice'));
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new PushRegistrationError(i18n.t('push:permissionNotGranted'));
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new PushRegistrationError(i18n.t('push:noEasProject'));
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (err) {
    throw new PushRegistrationError(
      err instanceof Error ? err.message : i18n.t('push:couldNotObtainToken'),
    );
  }
}
