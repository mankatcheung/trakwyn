import { describe, it, expect } from 'vitest';
import {
  addEntry,
  moveEntry,
  providerEntryLabel,
  removeEntry,
  unlistedEntries,
} from '#/routes/_authenticated/settings/-components/aiProviderOrder';

const t = (key: string) => (key === 'aiSource.trakwyn' ? 'Trakwyn AI' : key);

describe('providerEntryLabel', () => {
  it('names the platform entry and each provider the way a person would', () => {
    expect(providerEntryLabel('trakwyn', t)).toBe('Trakwyn AI');
    expect(providerEntryLabel('anthropic', t)).toBe('Anthropic (Claude)');
  });

  it('falls back to the id for a provider it does not know', () => {
    expect(providerEntryLabel('some-new-vendor', t)).toBe('some-new-vendor');
  });
});

describe('moveEntry', () => {
  it('moves an entry toward the front or the back', () => {
    expect(moveEntry(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveEntry(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('changes nothing for a move off either end', () => {
    expect(moveEntry(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveEntry(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('changes nothing for an index that is not in the list', () => {
    expect(moveEntry(['a', 'b'], 5, -1)).toEqual(['a', 'b']);
  });

  it('returns a new list and leaves the original alone', () => {
    const original = ['a', 'b'];
    const moved = moveEntry(original, 0, 1);

    expect(moved).not.toBe(original);
    expect(original).toEqual(['a', 'b']);
  });
});

describe('removeEntry and addEntry', () => {
  it('removes an entry and keeps the order of the rest', () => {
    expect(removeEntry(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('adds an entry at the end, where it answers only after the rest have failed', () => {
    expect(addEntry(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('does not list an entry twice', () => {
    expect(addEntry(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });
});

describe('unlistedEntries', () => {
  const keys = [{ provider: 'openai' }, { provider: 'anthropic' }];

  it('offers each saved key that is not listed', () => {
    expect(unlistedEntries(['openai'], keys, false)).toEqual(['anthropic']);
  });

  it('offers Trakwyn AI first when the plan has it and it is not listed', () => {
    expect(unlistedEntries(['openai'], keys, true)).toEqual(['trakwyn', 'anthropic']);
  });

  it('does not offer Trakwyn AI on a plan without it, or while the plan is loading', () => {
    expect(unlistedEntries([], [], false)).toEqual([]);
    expect(unlistedEntries([], [], null)).toEqual([]);
  });

  it('offers nothing when everything is already listed', () => {
    expect(unlistedEntries(['trakwyn', 'openai', 'anthropic'], keys, true)).toEqual([]);
  });
});
