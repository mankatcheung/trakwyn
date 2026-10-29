import { describe, it, expect } from 'vitest';
import {
  parseTrakwynClipperHeader,
  plausibleVersion,
} from '#src/infrastructure/device/trakwynClipperHeader.js';

describe('plausibleVersion', () => {
  it.each(['1.3.1', '0.0.1', '12.345.6', '1.3.1-beta.2', '1.0.0-rc1'])('keeps %s', (version) => {
    expect(plausibleVersion(version)).toBe(version);
  });

  it.each([
    ['nothing', undefined],
    ['empty', ''],
    ['not numeric', 'latest'],
    ['two parts', '1.3'],
    ['four parts', '1.3.1.9'],
    ['a part too long', '1.3.1234'],
    ['a long prerelease', '1.3.1-' + 'a'.repeat(17)],
    ['injected text', '1.3.1\nINJECTED'],
    ['padded', ' 1.3.1'],
  ])('drops %s', (_label, version) => {
    expect(plausibleVersion(version)).toBeUndefined();
  });
});

describe('parseTrakwynClipperHeader (JEF-473)', () => {
  it('reads the version out of the Clipper header', () => {
    expect(parseTrakwynClipperHeader('TrakwynClipper/1.3.1')).toBe('1.3.1');
  });

  it('keeps a prerelease version', () => {
    expect(parseTrakwynClipperHeader('TrakwynClipper/1.4.0-beta.1')).toBe('1.4.0-beta.1');
  });

  it.each([
    ['missing', undefined],
    ['repeated, so an array', ['TrakwynClipper/1.3.1', 'TrakwynClipper/1.3.2']],
    ['another client', 'TrakwynMobile/1.3.1'],
    ['no version', 'TrakwynClipper/'],
    ['a version that is not one', 'TrakwynClipper/latest'],
    ['too long to be one', `TrakwynClipper/${'1'.repeat(40)}`],
    ['trailing text', 'TrakwynClipper/1.3.1 extra'],
    ['wrong case', 'trakwynclipper/1.3.1'],
  ])('is undefined when the header is %s', (_label, value) => {
    expect(parseTrakwynClipperHeader(value)).toBeUndefined();
  });
});
