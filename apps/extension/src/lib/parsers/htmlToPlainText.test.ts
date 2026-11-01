// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from './htmlToPlainText';

describe('htmlToPlainText', () => {
  it('returns undefined for empty input', () => {
    expect(htmlToPlainText(undefined)).toBeUndefined();
    expect(htmlToPlainText('')).toBeUndefined();
  });

  it('keeps text and drops tags', () => {
    expect(htmlToPlainText('<p>Build <b>things</b></p>')).toBe('Build things');
  });

  it('returns leftover angle brackets as inert text, never as parsed markup', () => {
    expect(htmlToPlainText('<<b>b>x')).toBe('<b>x');
  });
});
