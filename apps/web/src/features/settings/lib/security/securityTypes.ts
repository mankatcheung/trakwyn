export type TotpSetup = { secret: string; otpauthUrl: string; qrCodeDataUrl: string };

export interface SecurityActivityItem {
  id: string;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Device-kind key for a session/security-event's user agent string — translate via `security.device.<kind>` at the call site. */
export type DeviceKind = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'unknown';

export function describeDevice(userAgent: string | null): DeviceKind {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  if (/Macintosh/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  if (/Linux/.test(userAgent)) return 'linux';
  return 'unknown';
}

export type Session = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  location: string | null;
  lastUsedAt: string;
  current: boolean;
};

export type LinkedOAuthAccount = {
  provider: 'google' | 'github';
  email: string | null;
  createdAt: string;
};

export type ReauthenticateResult = {
  success: boolean;
  totpRequired: boolean;
  accessToken: string | null;
};
