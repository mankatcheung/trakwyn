import { htmlToText } from '#src/infrastructure/jobDescription/htmlToText.js';

/**
 * Parts of a page that are not what the company says about itself: the head
 * (its title would head the text twice), the notice shown when scripts do
 * not run, site navigation and footer, inline graphics and templates. A
 * single pass is enough, because whatever tag survives is removed by
 * `htmlToText`; this only decides which words are kept.
 */
const NOT_CONTENT = /<(head|noscript|nav|footer|svg|template)\b[\s\S]*?<\/\1\s*>/gi;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  trade: '™',
  copy: '©',
  reg: '®',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  bull: '•',
  apos: "'",
};

const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi;

/** `<` and `>` are never produced: the result is text for a model, and stays free of markup. */
function isPrintable(code: number): boolean {
  if (code === 0x3c || code === 0x3e) return false;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return (code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0x10ffff);
}

/** Decodes the numeric and common named entities `htmlToText` leaves, so `&trade;` reads as ™. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match: string, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return isPrintable(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** What a company page says, as plain text: no markup, no navigation, entities decoded. */
export function readableText(html: string): string {
  return decodeEntities(htmlToText(html.replace(NOT_CONTENT, ' ')));
}
