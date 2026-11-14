import { insertLink, normalizeLinkUrl, toggleLinePrefix, wrapSelection } from '../markdownEditing';

describe('wrapSelection', () => {
  it('wraps a selected range in the marker on both sides', () => {
    const result = wrapSelection('Hello world', { start: 6, end: 11 }, '**');
    expect(result.text).toBe('Hello **world**');
    expect(result.selection).toEqual({ start: 6, end: 15 });
  });

  it('inserts an empty marker pair and places the cursor between them when nothing is selected', () => {
    const result = wrapSelection('Hello ', { start: 6, end: 6 }, '*');
    expect(result.text).toBe('Hello **');
    expect(result.selection).toEqual({ start: 7, end: 7 });
  });
});

describe('toggleLinePrefix', () => {
  it('adds the prefix to the current line', () => {
    const result = toggleLinePrefix('First\nSecond line', { start: 8, end: 8 }, '# ');
    expect(result.text).toBe('First\n# Second line');
    expect(result.selection).toEqual({ start: 10, end: 10 });
  });

  it('removes the prefix if the line already has it', () => {
    const result = toggleLinePrefix('# Heading', { start: 5, end: 5 }, '# ');
    expect(result.text).toBe('Heading');
    expect(result.selection).toEqual({ start: 3, end: 3 });
  });

  it('operates on the line containing the cursor, not the whole text', () => {
    const result = toggleLinePrefix('Line one\nLine two\nLine three', { start: 12, end: 12 }, '- ');
    expect(result.text).toBe('Line one\n- Line two\nLine three');
  });

  it('does not let the selection go before the start of the line', () => {
    const result = toggleLinePrefix('## Title', { start: 0, end: 0 }, '## ');
    expect(result.text).toBe('Title');
    expect(result.selection).toEqual({ start: 0, end: 0 });
  });
});

describe('strike and quote', () => {
  it('wraps the selection in ~~ for strikethrough', () => {
    const result = wrapSelection('Old price', { start: 4, end: 9 }, '~~');
    expect(result.text).toBe('Old ~~price~~');
  });

  it('toggles a quote prefix on the current line', () => {
    expect(toggleLinePrefix('Said so', { start: 2, end: 2 }, '> ').text).toBe('> Said so');
    expect(toggleLinePrefix('> Said so', { start: 4, end: 4 }, '> ').text).toBe('Said so');
  });
});

describe('normalizeLinkUrl', () => {
  it('keeps a web or mail URL and adds https:// to a bare host', () => {
    expect(normalizeLinkUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeLinkUrl(' http://example.com ')).toBe('http://example.com');
    expect(normalizeLinkUrl('mailto:me@example.com')).toBe('mailto:me@example.com');
    expect(normalizeLinkUrl('example.com/cv')).toBe('https://example.com/cv');
  });

  it('refuses unsafe, empty and Markdown-breaking addresses', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/html,hi')).toBeNull();
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('https://exa mple.com')).toBeNull();
    expect(normalizeLinkUrl('https://example.com/a)b')).toBeNull();
  });
});

describe('insertLink', () => {
  it('turns the selection into a link and puts the cursor after it', () => {
    const result = insertLink('See my site now', { start: 4, end: 11 }, 'example.com');
    expect(result).toEqual({
      text: 'See [my site](https://example.com) now',
      selection: { start: 34, end: 34 },
    });
  });

  it('inserts the address as its own label when nothing is selected', () => {
    const result = insertLink('Hi ', { start: 3, end: 3 }, 'https://example.com');
    expect(result?.text).toBe('Hi [https://example.com](https://example.com)');
  });

  it('returns null for an unsafe address', () => {
    expect(insertLink('Hi', { start: 0, end: 2 }, 'javascript:alert(1)')).toBeNull();
  });
});
