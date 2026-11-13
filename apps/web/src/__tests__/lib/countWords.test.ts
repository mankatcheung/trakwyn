import { describe, it, expect } from 'vitest';
import { countWords } from '#/lib/editor/countWords';

describe('countWords (JEF-576)', () => {
  it('counts nothing for empty or blank text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });

  it('counts whitespace-separated words', () => {
    expect(countWords('Dear hiring manager')).toBe(3);
    expect(countWords('  spaced   out \n words ')).toBe(3);
  });

  it('counts a hyphenated word or a contraction once, as a word processor does', () => {
    expect(countWords('a well-known e-mail')).toBe(3);
    expect(countWords("don't")).toBe(1);
    expect(countWords('$5,000 in 2024')).toBe(3);
  });

  it('does not count punctuation on its own', () => {
    expect(countWords('one — two & three')).toBe(3);
    expect(countWords('... --- !!!')).toBe(0);
  });

  it('counts words in text written without spaces', () => {
    // Chinese text is split by the dictionary, so it reads as many words, not one.
    expect(countWords('我有十年的软件工程经验')).toBeGreaterThan(3);
    expect(countWords('こんにちは世界')).toBeGreaterThanOrEqual(2);
  });

  it('adds spaced and unspaced runs together', () => {
    const mixed = countWords('Senior 工程师 at Acme');
    expect(mixed).toBeGreaterThanOrEqual(4);
  });
});
