import { describe, expect, it } from 'vitest';
import {
  cleanCompanyName,
  companyKeySegment,
} from '#src/infrastructure/companyResearch/companyQuery.js';
import { COMPANY_SEARCH } from '#src/infrastructure/config/constants.js';

describe('cleanCompanyName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(cleanCompanyName('Acme Corp')).toBe('Acme Corp');
  });

  it('collapses whitespace and newlines to single spaces', () => {
    expect(cleanCompanyName('  Acme \n\t Corp  ')).toBe('Acme Corp');
  });

  it('removes double quotes, so a name cannot close the quoted phrase it is put in', () => {
    expect(cleanCompanyName('Acme" OR "Evil')).toBe('Acme OR Evil');
  });

  it('removes control characters', () => {
    expect(cleanCompanyName('Ac\u0000me\u0007')).toBe('Ac me');
  });

  it('cuts a very long name', () => {
    expect(cleanCompanyName('a'.repeat(1_000))).toHaveLength(COMPANY_SEARCH.MAX_COMPANY_CHARS);
  });

  it.each(['', '   ', '""', '\n'])('is null when nothing is left of %j', (name) => {
    expect(cleanCompanyName(name)).toBeNull();
  });

  it('keeps non-latin names', () => {
    expect(cleanCompanyName('株式会社 テスト')).toBe('株式会社 テスト');
  });
});

describe('companyKeySegment', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(companyKeySegment('Acme  Corp.')).toBe('acme-corp');
  });

  it('is the same for spellings that differ only by case, spacing and punctuation', () => {
    expect(companyKeySegment('ACME corp')).toBe(companyKeySegment('Acme, Corp'));
  });

  it('holds only letters, digits and hyphens, so a name cannot add to the key’s structure', () => {
    expect(companyKeySegment('a:b*c?d{e}')).toBe('a-b-c-d-e');
    expect(companyKeySegment('Acme:Evil')).not.toContain(':');
  });

  it('keeps non-latin letters, so two such names do not collapse into one key', () => {
    expect(companyKeySegment('株式会社テスト')).not.toBe(companyKeySegment('株式会社サンプル'));
  });

  it('never returns an empty segment', () => {
    expect(companyKeySegment('---')).toBe('company');
  });
});
