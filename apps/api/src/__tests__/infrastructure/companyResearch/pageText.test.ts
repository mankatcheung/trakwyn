import { describe, it, expect } from 'vitest';
import { decodeEntities, readableText } from '#src/infrastructure/companyResearch/pageText.js';

describe('decodeEntities', () => {
  it.each([
    ['About Python&trade;', 'About Python™'],
    ['We&rsquo;re hiring &mdash; join us', 'We’re hiring — join us'],
    ['It&#39;s here', "It's here"],
    ['It&#x27;s here', "It's here"],
    ['&copy; 2026 Acme &middot; Leeds', '© 2026 Acme · Leeds'],
    ['caf&#233;', 'café'],
  ])('decodes %s', (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });

  it('never turns an entity into markup', () => {
    expect(decodeEntities('&#60;script&#62; &#x3c;b&#x3e;')).toBe('&#60;script&#62; &#x3c;b&#x3e;');
  });

  it.each(['&#0;', '&#1;', '&#xD800;', '&#1114112;', '&unknownentity;', '&amp;'])(
    'leaves %s as it is',
    (entity) => {
      expect(decodeEntities(entity)).toBe(entity);
    },
  );

  it('is a single pass: a decoded ampersand does not start another entity', () => {
    expect(decodeEntities('&#38;trade;')).toBe('&trade;');
  });
});

describe('readableText', () => {
  const PAGE = `<!doctype html><html><head><title>Acme | Payroll</title><style>.a{}</style></head>
    <body>
      <noscript>Notice: this page displays a fallback because scripts did not run.</noscript>
      <nav><a href="/">Home</a> <a href="/pricing">Pricing</a></nav>
      <h1>Acme builds payroll software</h1>
      <p>We&rsquo;re based in Leeds.</p>
      <svg><text>logo</text></svg>
      <footer>Terms &middot; Privacy &middot; Cookies</footer>
    </body></html>`;

  it('keeps what the page says and drops the title, the script notice, navigation and footer', () => {
    const text = readableText(PAGE);

    expect(text).toContain('Acme builds payroll software');
    expect(text).toContain('We’re based in Leeds.');
    expect(text).not.toContain('Acme | Payroll');
    expect(text).not.toContain('fallback');
    expect(text).not.toContain('Pricing');
    expect(text).not.toContain('Cookies');
    expect(text).not.toContain('logo');
  });

  it('returns text with no markup', () => {
    expect(readableText(PAGE)).not.toMatch(/[<>]/);
  });

  it('drops a script body', () => {
    expect(readableText('<p>Hello there</p><script>steal()</script>')).not.toContain('steal');
  });
});
