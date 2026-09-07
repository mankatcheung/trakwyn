import { resolveNotificationRoute } from '../resolveNotificationRoute';

describe('resolveNotificationRoute', () => {
  it('maps an application deep link to the Applications tab route, dropping the query string', () => {
    expect(resolveNotificationRoute('/applications/abc123?section=interviews')).toBe(
      '/(tabs)/applications/abc123',
    );
  });

  it('maps a bare application path', () => {
    expect(resolveNotificationRoute('/applications/abc123')).toBe('/(tabs)/applications/abc123');
  });

  it('returns null for a null url', () => {
    expect(resolveNotificationRoute(null)).toBeNull();
  });

  it('returns null for an unrecognized path', () => {
    expect(resolveNotificationRoute('/settings/security')).toBeNull();
  });
});
