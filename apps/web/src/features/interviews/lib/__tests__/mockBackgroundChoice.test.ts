import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readRememberedUseProfile,
  rememberUseProfile,
} from '#/features/interviews/lib/mockBackgroundChoice';

const KEY = 'trakwyn.mockUseProfile';

describe('mockBackgroundChoice (JEF-394)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('is off until the user switches it on', () => {
    expect(readRememberedUseProfile()).toBe(false);
  });

  it('returns the fallback when nothing is stored', () => {
    expect(readRememberedUseProfile(true)).toBe(true);
  });

  it('remembers on and off', () => {
    rememberUseProfile(true);
    expect(window.localStorage.getItem(KEY)).toBe('true');
    expect(readRememberedUseProfile()).toBe(true);
    rememberUseProfile(false);
    expect(readRememberedUseProfile(true)).toBe(false);
  });

  it('treats any stored value but "true" as off', () => {
    window.localStorage.setItem(KEY, 'yes');
    expect(readRememberedUseProfile(true)).toBe(false);
  });

  it('falls back when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readRememberedUseProfile(true)).toBe(true);
  });

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberUseProfile(true)).not.toThrow();
  });
});
