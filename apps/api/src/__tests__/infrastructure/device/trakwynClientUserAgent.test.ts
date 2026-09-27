import { describe, expect, it } from 'vitest';
import { parseTrakwynClientUserAgent } from '#src/infrastructure/device/trakwynClientUserAgent.js';

describe('parseTrakwynClientUserAgent', () => {
  it('splits a full mobile User-Agent into version, model and OS', () => {
    expect(parseTrakwynClientUserAgent('TrakwynMobile/1.2.3 (iPhone 15 Pro; iOS 17.4)')).toEqual({
      version: '1.2.3',
      model: 'iPhone 15 Pro',
      os: 'iOS 17.4',
      osName: 'iOS',
      osVersion: '17.4',
    });
  });

  it('splits the OS on its last space, so a multi-word OS name stays whole', () => {
    expect(
      parseTrakwynClientUserAgent('TrakwynMobile/1.0.0 (iPad Air; iPadOS Beta 18.0)'),
    ).toMatchObject({
      osName: 'iPadOS Beta',
      osVersion: '18.0',
    });
  });

  it('leaves out a model the app could not read', () => {
    expect(parseTrakwynClientUserAgent('TrakwynMobile/1.2.3 (; iOS 17.4)')).toEqual({
      version: '1.2.3',
      model: undefined,
      os: 'iOS 17.4',
      osName: 'iOS',
      osVersion: '17.4',
    });
  });

  it('reads an OS with no version as a name only', () => {
    expect(parseTrakwynClientUserAgent('TrakwynMobile/1.2.3 (Pixel 8; android)')).toEqual({
      version: '1.2.3',
      model: 'Pixel 8',
      os: 'android',
      osName: 'android',
    });
  });

  it('keeps the version when both model and OS are empty', () => {
    expect(parseTrakwynClientUserAgent('TrakwynMobile/0.0.0 (; )')).toEqual({
      version: '0.0.0',
      model: undefined,
      os: undefined,
    });
  });

  it('returns null for a browser User-Agent', () => {
    expect(
      parseTrakwynClientUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBeNull();
  });

  it('returns null for the native HTTP stacks the app replaces', () => {
    expect(parseTrakwynClientUserAgent('Trakwyn/1 CFNetwork/1498.700.2 Darwin/23.6.0')).toBeNull();
    expect(parseTrakwynClientUserAgent('okhttp/4.12.0')).toBeNull();
  });

  it('returns null for a missing, empty or malformed value', () => {
    expect(parseTrakwynClientUserAgent(null)).toBeNull();
    expect(parseTrakwynClientUserAgent(undefined)).toBeNull();
    expect(parseTrakwynClientUserAgent('')).toBeNull();
    expect(parseTrakwynClientUserAgent('TrakwynMobile/1.2.3')).toBeNull();
    expect(parseTrakwynClientUserAgent('TrakwynMobile/ (iPhone; iOS 17)')).toBeNull();
    expect(parseTrakwynClientUserAgent('x TrakwynMobile/1.2.3 (iPhone; iOS 17)')).toBeNull();
  });
});
