import { toggleLinePrefix, wrapSelection } from '../markdownEditing';

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
