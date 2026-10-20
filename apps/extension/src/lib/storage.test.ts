import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getParseMode, setParseMode } from './storage';
import { STORAGE_KEYS } from '../constants';

beforeEach(() => fakeBrowser.reset());

describe('parse mode', () => {
  it('defaults to builtin', async () => {
    await expect(getParseMode()).resolves.toBe('builtin');
  });

  it('round-trips through sync storage', async () => {
    await setParseMode('ai');

    await expect(getParseMode()).resolves.toBe('ai');
    expect(
      (await fakeBrowser.storage.sync.get(STORAGE_KEYS.PARSE_MODE))[STORAGE_KEYS.PARSE_MODE],
    ).toBe('ai');
  });

  it('reads an unrecognised stored value as builtin', async () => {
    await fakeBrowser.storage.sync.set({ [STORAGE_KEYS.PARSE_MODE]: 'gpt' });

    await expect(getParseMode()).resolves.toBe('builtin');
  });
});
