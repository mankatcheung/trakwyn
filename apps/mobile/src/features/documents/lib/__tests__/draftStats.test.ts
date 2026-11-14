import { countDraft, countWords, stripMarkdown } from '../draftStats';

describe('stripMarkdown', () => {
  it('drops the markers but keeps the words', () => {
    const md =
      '# Jane Doe\n\n**Senior** *engineer* and ~~intern~~\n\n- Built [things](https://x.com)\n1. Shipped\n> Quote\n---';
    expect(stripMarkdown(md).replace(/\n+/g, '|')).toBe(
      'Jane Doe|Senior engineer and intern|Built things|Shipped|Quote|',
    );
  });

  it('leaves snake_case and a lone asterisk in a sum alone', () => {
    expect(stripMarkdown('use snake_case and 2 * 3')).toBe('use snake_case and 2 * 3');
  });

  it('unescapes what the editor escaped', () => {
    expect(stripMarkdown('a \\* b')).toBe('a * b');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words and ignores lone punctuation', () => {
    expect(countWords("well-known don't - stop")).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('counts a run of Chinese by word or character, not as one word', () => {
    expect(countWords('我喜欢写代码')).toBeGreaterThan(1);
  });
});

describe('countDraft', () => {
  it('counts the whole draft without markers', () => {
    expect(countDraft('# Hi\n\n**there** you', { start: 0, end: 0 })).toEqual({
      words: 3,
      characters: 'Hi\n\nthere you'.length,
      selected: false,
    });
  });

  it('counts only the selection while text is selected, in either direction', () => {
    const text = 'one two three four';
    expect(countDraft(text, { start: 4, end: 13 })).toEqual({
      words: 2,
      characters: 9,
      selected: true,
    });
    expect(countDraft(text, { start: 13, end: 4 }).words).toBe(2);
  });
});
