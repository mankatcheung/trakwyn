import { describe, expect, it } from 'vitest';
import { ALL_CASES, selectCases } from '#src/evals/cases/index.js';
import { JOB_DESCRIPTION_CASES } from '#src/evals/cases/jobDescription.js';
import { RESUME_MATCH_CASES } from '#src/evals/cases/resumeMatch.js';
import {
  atMostChars,
  atMostItems,
  excludes,
  failuresOf,
  isNull,
  isPresent,
  listMentionsAny,
  listsDisjoint,
  mentions,
  mentionsAny,
  nullOrMentions,
  scoreBetween,
} from '#src/evals/cases/matchers.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const answering = (reply: string) => makeLLMProvider(reply);

describe('the case list', () => {
  it('has the size the ticket asks for, with unique ids', () => {
    const ids = ALL_CASES.map((evalCase) => evalCase.id);

    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both features', () => {
    expect(JOB_DESCRIPTION_CASES.length).toBeGreaterThan(0);
    expect(RESUME_MATCH_CASES.length).toBeGreaterThan(0);
    expect(new Set(ALL_CASES.map((evalCase) => evalCase.feature))).toEqual(
      new Set(['jobDescription', 'resumeMatch']),
    );
  });

  it('includes the zero-overlap and strong-match pairings the ticket names', () => {
    const ids = RESUME_MATCH_CASES.map((evalCase) => evalCase.id);

    expect(ids.some((id) => id.includes('zero-overlap'))).toBe(true);
    expect(ids.some((id) => id.includes('strong'))).toBe(true);
  });
});

describe.each(ALL_CASES)('case $id', (evalCase) => {
  it('passes when the model gives its ideal reply, so the checks can be met', async () => {
    const failures = await evalCase.run(answering(evalCase.idealReply));

    expect(failures).toEqual([]);
  });
});

describe('the job-description checks are not vacuous', () => {
  const allNull = JSON.stringify({
    company: null,
    role: null,
    location: null,
    salary: null,
    description: null,
  });

  it.each(JOB_DESCRIPTION_CASES)('$id fails a model that finds nothing', async (evalCase) => {
    const failures = await evalCase.run(answering(allNull));

    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('the match-score checks are not vacuous', () => {
  const scored = (matchPercentage: number) =>
    JSON.stringify({
      matchPercentage,
      matchedKeywords: [],
      missingKeywords: [],
      summary: 'A summary.',
    });

  it.each(RESUME_MATCH_CASES)(
    '$id fails a model that scores 2 or 98 for every pairing',
    async (evalCase) => {
      const low = await evalCase.run(answering(scored(2)));
      const high = await evalCase.run(answering(scored(98)));

      expect(low.length > 0 || high.length > 0).toBe(true);
    },
  );

  it('rejects a reply that is not the JSON the prompt asks for', async () => {
    const [first] = RESUME_MATCH_CASES;

    await expect(first?.run(answering('Sure! The match is about 80%.'))).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
    });
  });
});

describe('selectCases', () => {
  it('returns everything when no ids are given', () => {
    expect(selectCases(ALL_CASES, [])).toBe(ALL_CASES);
  });

  it('returns only the named cases', () => {
    const [a, b] = ALL_CASES;

    expect(selectCases(ALL_CASES, [b?.id as string])).toEqual([b]);
    expect(selectCases(ALL_CASES, [a?.id as string, b?.id as string])).toEqual([a, b]);
  });

  it('refuses an unknown id instead of running nothing', () => {
    expect(() => selectCases(ALL_CASES, ['nope'])).toThrow(/Unknown case nope/);
  });
});

describe('matchers', () => {
  it('mentions is case-insensitive and names what is missing', () => {
    expect(mentions('role', 'Senior BACKEND Engineer', 'backend', 'engineer')).toBeNull();
    expect(mentions('role', 'Designer', 'engineer')).toContain('"engineer"');
    expect(mentions('role', null, 'engineer')).toContain('null');
  });

  it('mentionsAny needs only one needle', () => {
    expect(mentionsAny('l', 'Munich', ['münchen', 'munich'])).toBeNull();
    expect(mentionsAny('l', 'Berlin', ['münchen', 'munich'])).not.toBeNull();
  });

  it('excludes fails on any needle', () => {
    expect(excludes('c', 'Harbor', 'evil')).toBeNull();
    expect(excludes('c', 'Evil Corp', 'evil')).not.toBeNull();
    expect(excludes('c', null, 'evil')).toBeNull();
  });

  it('isNull, nullOrMentions and isPresent', () => {
    expect(isNull('s', null)).toBeNull();
    expect(isNull('s', '£1')).not.toBeNull();
    expect(nullOrMentions('c', null, 'family')).toBeNull();
    expect(nullOrMentions('c', 'Family firm', 'family')).toBeNull();
    expect(nullOrMentions('c', 'Acme', 'family')).not.toBeNull();
    expect(isPresent('d', 'text')).toBeNull();
    expect(isPresent('d', '  ')).not.toBeNull();
    expect(isPresent('d', null)).not.toBeNull();
  });

  it('atMostChars treats null as nothing to measure', () => {
    expect(atMostChars('d', 'abc', 3)).toBeNull();
    expect(atMostChars('d', 'abcd', 3)).toContain('4 characters');
    expect(atMostChars('d', null, 3)).toBeNull();
  });

  it('scoreBetween is inclusive at both ends', () => {
    expect(scoreBetween(70, 70, 100)).toBeNull();
    expect(scoreBetween(100, 70, 100)).toBeNull();
    expect(scoreBetween(69, 70, 100)).toContain('69');
  });

  it('list matchers', () => {
    expect(listMentionsAny('k', ['TypeScript'], ['typescript'])).toBeNull();
    expect(listMentionsAny('k', [], ['typescript'])).not.toBeNull();
    expect(atMostItems('k', ['a', 'b'], 2)).toBeNull();
    expect(atMostItems('k', ['a', 'b', 'c'], 2)).not.toBeNull();
    expect(listsDisjoint(['AWS'], ['Go'])).toBeNull();
    expect(listsDisjoint(['AWS '], ['aws'])).toContain('"aws"');
  });

  it('failuresOf keeps only the failures', () => {
    expect(failuresOf(null, 'a', null, 'b')).toEqual(['a', 'b']);
    expect(failuresOf(null)).toEqual([]);
  });
});
