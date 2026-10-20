import { afterEach, describe, expect, it } from 'vitest';
import { extractPageText } from './pageText';
import { PAGE_TEXT_MAX_CHARS } from '../../constants';
import {
  POSTING_WITHOUT_MAIN,
  POSTING_WITH_MAIN,
  POSTING_WITH_STUB_MAIN,
} from './__fixtures__/jobPosting.fixture';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractPageText', () => {
  it('reads the main area and leaves out the page chrome', () => {
    document.body.innerHTML = POSTING_WITH_MAIN;

    const text = extractPageText(document);

    expect(text).toContain('Senior Platform Engineer');
    expect(text).toContain('Acme Corp');
    expect(text).not.toContain('Messaging');
    expect(text).not.toContain('Cookies');
  });

  it('falls back to the body when there is no main area', () => {
    document.body.innerHTML = POSTING_WITHOUT_MAIN;

    expect(extractPageText(document)).toBe(
      'Data Analyst Globex Own the reporting that finance and product rely on.',
    );
  });

  it('ignores a main area too short to be the posting', () => {
    document.body.innerHTML = POSTING_WITH_STUB_MAIN;

    expect(extractPageText(document)).toContain('Initech needs a designer.');
  });

  it('collapses whitespace and caps the length', () => {
    document.body.innerHTML = `<p>${'word   \n '.repeat(5000)}</p>`;

    const text = extractPageText(document);

    expect(text).toHaveLength(PAGE_TEXT_MAX_CHARS);
    expect(text).not.toMatch(/\s{2}/);
  });

  it('returns an empty string for an empty page', () => {
    expect(extractPageText(document)).toBe('');
  });
});
