import { describe, it, expect } from 'vitest';
import { parseExtensionOAuthIds } from '#src/infrastructure/auth/extensionOAuthIds.js';

const ID_A = 'abcdefghijklmnopabcdefghijklmnop';
const ID_B = 'ponmlkjihgfedcbaponmlkjihgfedcba';

describe('parseExtensionOAuthIds', () => {
  it('is empty when the env var is unset', () => {
    expect(parseExtensionOAuthIds(undefined).size).toBe(0);
  });

  it('parses a comma-separated list, trimming whitespace', () => {
    expect([...parseExtensionOAuthIds(` ${ID_A} ,${ID_B}`)]).toEqual([ID_A, ID_B]);
  });

  it('drops anything that is not a Chrome extension ID', () => {
    const ids = parseExtensionOAuthIds(
      `${ID_A},evil.example.com,${ID_A.toUpperCase()},${ID_A}z,,abcdefghijklmnopqrstuvwxyzabcdef`,
    );

    expect([...ids]).toEqual([ID_A]);
  });
});
