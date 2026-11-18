import { describe, expect, it } from 'vitest';
import { linkHostToShow, safeMarkdownUrl } from '#/lib/safeMarkdownUrl';

describe('safeMarkdownUrl (JEF-464)', () => {
  it.each([
    'https://example.com',
    'https://example.com/path?q=1#frag',
    'http://example.com',
    'HTTPS://EXAMPLE.COM/Path',
    'mailto:me@example.com',
  ])('keeps %s unchanged', (url) => {
    expect(safeMarkdownUrl(url)).toBe(url);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['mixed-case javascript:', 'JaVaScRiPt:alert(1)'],
    ['data: html', 'data:text/html;base64,PHNjcmlwdD4='],
    ['data: image', 'data:image/svg+xml,<svg/>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/file'],
    ['relative path', '/settings/profile'],
    ['relative file', 'image.png'],
    ['protocol-relative', '//evil.example.com/pixel.png'],
    ['fragment only', '#section'],
    ['empty string', ''],
    ['whitespace', '   '],
  ])('blanks %s', (_name, url) => {
    expect(safeMarkdownUrl(url)).toBe('');
  });
});

describe('linkHostToShow', () => {
  it('returns the host when the label does not name it', () => {
    expect(linkHostToShow('https://evil.example.com/login', 'Your bank')).toBe('evil.example.com');
  });

  it('returns null when the label already names the host', () => {
    expect(linkHostToShow('https://example.com/a', 'See example.com for more')).toBeNull();
  });

  it('compares the label case-insensitively', () => {
    expect(linkHostToShow('https://example.com', 'EXAMPLE.COM')).toBeNull();
  });

  it('returns null when the label names the host without www.', () => {
    expect(linkHostToShow('https://www.example.com/a', 'example.com')).toBeNull();
  });

  it('returns the www. host when the label names neither form', () => {
    expect(linkHostToShow('https://www.example.com/a', 'docs')).toBe('www.example.com');
  });

  it('returns null for mailto: links', () => {
    expect(linkHostToShow('mailto:me@example.com', 'Email me')).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', '/relative', '//evil.example.com', ''])(
    'returns null for the unsafe URL %j',
    (href) => {
      expect(linkHostToShow(href, 'label')).toBeNull();
    },
  );
});
