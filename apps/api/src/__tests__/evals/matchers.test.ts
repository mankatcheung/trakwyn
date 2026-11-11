import { describe, expect, it } from 'vitest';
import {
  excludes,
  listMentionsAny,
  listsDisjoint,
  mentions,
  mentionsAny,
  normaliseText,
} from '#src/evals/cases/matchers.js';

// The special characters are written as escapes so they stay visible in review.
const NNBSP = ' '; // narrow no-break space
const NBSP = ' '; // no-break space
const NB_HYPHEN = '‑'; // non-breaking hyphen

describe('normaliseText', () => {
  it('turns Unicode spaces into one plain space', () => {
    expect(normaliseText(`a${NNBSP}b${NBSP}${NBSP}c d`)).toBe('a b c d');
  });

  it('turns hyphen and dash variants into a hyphen', () => {
    expect(normaliseText('a‐b‑c‒d–e—f')).toBe('a-b-c-d-e-f');
  });

  it('folds lookalikes with NFKC and lowercases', () => {
    expect(normaliseText('ＡＢC')).toBe('abc');
  });

  it('treats null as empty', () => {
    expect(normaliseText(null)).toBe('');
  });
});

describe('mentions', () => {
  it('finds phrases written with no-break spaces', () => {
    expect(mentions('briefing', `a ${'Series'}${NNBSP}B round`, 'Series B')).toBeNull();
    expect(mentions('briefing', `In March${NBSP}2026 it`, 'March 2026')).toBeNull();
  });

  it('still reports a missing phrase and keeps the original text in the reason', () => {
    const reason = mentions('briefing', `Series${NNBSP}A`, 'Series B');
    expect(reason).toContain('expected it to mention "Series B"');
    expect(reason).toContain(NNBSP);
  });

  it('behaves as before for plain ASCII', () => {
    expect(mentions('x', 'Remote (Europe)', 'remote')).toBeNull();
    expect(mentions('x', 'onsite', 'remote')).not.toBeNull();
    expect(mentions('x', null, 'remote')).not.toBeNull();
  });
});

describe('mentionsAny', () => {
  it('matches a hyphenated needle against a non-breaking hyphen', () => {
    expect(mentionsAny('x', `Pair${NB_HYPHEN}programming`, ['pair-programming'])).toBeNull();
  });

  it('fails when no needle is present', () => {
    expect(mentionsAny('x', 'nothing here', ['pair-programming'])).not.toBeNull();
  });
});

describe('excludes', () => {
  it('catches a forbidden phrase written with a no-break space', () => {
    expect(excludes('x', `they laid${NNBSP}off staff`, 'laid off')).not.toBeNull();
    expect(excludes('x', `Northwind${NBSP}Traders`, 'Northwind Traders')).not.toBeNull();
  });

  it('passes when the phrase is absent', () => {
    expect(excludes('x', 'all fine', 'laid off')).toBeNull();
  });
});

describe('listMentionsAny', () => {
  it('matches items written with Unicode spaces', () => {
    expect(listMentionsAny('x', [`Node${NBSP}js`], ['node js'])).toBeNull();
    expect(listMentionsAny('x', ['Go'], ['node js'])).not.toBeNull();
  });
});

describe('listsDisjoint', () => {
  it('reports an item that differs only by Unicode spaces as the same', () => {
    expect(listsDisjoint([`Node${NBSP}js`], ['node js'])).toContain('listed as both');
  });

  it('ignores case and surrounding space as before', () => {
    expect(listsDisjoint([' React '], ['react'])).not.toBeNull();
    expect(listsDisjoint(['React'], ['Vue'])).toBeNull();
  });
});
