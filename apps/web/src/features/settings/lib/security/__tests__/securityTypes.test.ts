import { describe, expect, it } from 'vitest';
import { describeDevice } from '../securityTypes';

describe('describeDevice', () => {
  it.each([
    [null, 'unknown'],
    ['', 'unknown'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'linux'],
    ['curl/8.0', 'unknown'],
  ])('maps %j to %s', (ua, kind) => {
    expect(describeDevice(ua)).toBe(kind);
  });
});
