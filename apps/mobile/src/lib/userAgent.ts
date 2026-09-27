import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * The User-Agent every request from the native app carries, e.g.
 * `TrakwynMobile/1.0.0 (iPhone 15 Pro; iOS 17.4)`. The API's
 * DeviceLabelService parses it into the label shown in the sessions list
 * and in the new-device login-alert email — without it the phone arrives
 * as OkHttp's or CFNetwork's default string and is listed as "Unknown
 * device". The API also records its parts (version, model, OS) on the
 * request's trace span, so keep the format in step with the API's
 * trakwynClientUserAgent.ts. Null on web, where the browser owns the header (it is a
 * forbidden request header there) and already sends one the service reads.
 */
export function buildUserAgent(): string | null {
  if (Platform.OS === 'web') return null;
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const model = Device.modelName ?? '';
  const os = [Device.osName ?? Platform.OS, Device.osVersion].filter(Boolean).join(' ');
  return `TrakwynMobile/${version} (${model}; ${os})`;
}
