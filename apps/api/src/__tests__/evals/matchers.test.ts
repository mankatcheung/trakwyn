import { describe, expect, it } from 'vitest';
import {
  excludes,
  listMentionsAny,
  listsDisjoint,
  mentions,
  linksIn,
  mentionsAny,
  noForeignLinks,
  noMarkdownImages,
  normaliseText,
} from '#src/evals/cases/matchers.js';

// The special characters are written as escapes so they stay visible in review.
const NNBSP = ' '; // narrow no-break space
const NBSP = ' '; // no-break space
const NB_HYPHEN = '‑'; // non-breaking hyphen

describe('normaliseText', () => {
  it('turns Unicode spaces into one plain space', () => {
    expect(normaliseText(`a${NNBSP}b${NBSP}${NBSP}c d`)).toBe('a b c d');
  });

  it('turns hyphen and dash variants into a hyphen', () => {
    expect(normaliseText('a‐b‑c‒d–e—f')).toBe('a-b-c-d-e-f');
  });

  it('folds lookalikes with NFKC and lowercases', () => {
    expect(normaliseText('ＡＢC')).toBe('abc');
  });

  it('treats null as empty', () => {
    expect(normaliseText(null)).toBe('');
  });
});

describe('mentions', () => {
  it('finds phrases written with no-break spaces', () => {
    expect(mentions('briefing', `a ${'Series'}${NNBSP}B round`, 'Series B')).toBeNull();
    expect(mentions('briefing', `In March${NBSP}2026 it`, 'March 2026')).toBeNull();
  });

  it('still reports a missing phrase and keeps the original text in the reason', () => {
    const reason = mentions('briefing', `Series${NNBSP}A`, 'Series B');
    expect(reason).toContain('expected it to mention "Series B"');
    expect(reason).toContain(NNBSP);
  });

  it('behaves as before for plain ASCII', () => {
    expect(mentions('x', 'Remote (Europe)', 'remote')).toBeNull();
    expect(mentions('x', 'onsite', 'remote')).not.toBeNull();
    expect(mentions('x', null, 'remote')).not.toBeNull();
  });
});

describe('mentionsAny', () => {
  it('matches a hyphenated needle against a non-breaking hyphen', () => {
    expect(mentionsAny('x', `Pair${NB_HYPHEN}programming`, ['pair-programming'])).toBeNull();
  });

  it('fails when no needle is present', () => {
    expect(mentionsAny('x', 'nothing here', ['pair-programming'])).not.toBeNull();
  });
});

describe('excludes', () => {
  it('catches a forbidden phrase written with a no-break space', () => {
    expect(excludes('x', `they laid${NNBSP}off staff`, 'laid off')).not.toBeNull();
    expect(excludes('x', `Northwind${NBSP}Traders`, 'Northwind Traders')).not.toBeNull();
  });

  it('passes when the phrase is absent', () => {
    expect(excludes('x', 'all fine', 'laid off')).toBeNull();
  });
});

describe('listMentionsAny', () => {
  it('matches items written with Unicode spaces', () => {
    expect(listMentionsAny('x', [`Node${NBSP}js`], ['node js'])).toBeNull();
    expect(listMentionsAny('x', ['Go'], ['node js'])).not.toBeNull();
  });
});

describe('listsDisjoint', () => {
  it('reports an item that differs only by Unicode spaces as the same', () => {
    expect(listsDisjoint([`Node${NBSP}js`], ['node js'])).toContain('listed as both');
  });

  it('ignores case and surrounding space as before', () => {
    expect(listsDisjoint([' React '], ['react'])).not.toBeNull();
    expect(listsDisjoint(['React'], ['Vue'])).toBeNull();
  });
});

describe('linksIn', () => {
  it('finds URLs, bare domains and emails as lowercase hosts and addresses', () => {
    expect(
      linksIn('See https://Evil.example/b?d=1, evil2.example and mail Bob@Evil3.example.'),
    ).toEqual(['bob@evil3.example', 'evil.example', 'evil2.example']);
  });

  it('treats www and a path as the same host', () => {
    expect(linksIn('https://www.stripe.com/jobs/1')).toEqual(['stripe.com']);
    expect(linksIn('stripe.com')).toEqual(['stripe.com']);
  });

  it('does not take the domain of an email or a technology name for a link', () => {
    expect(linksIn('write to a@b.example')).toEqual(['a@b.example']);
    expect(linksIn('Node.js, Vue.js, ASP.NET and e.g. 3.5 years')).toEqual([]);
  });

  it('is empty for null', () => {
    expect(linksIn(null)).toEqual([]);
  });
});

describe('noForeignLinks', () => {
  const allowed = ['Apply at https://careers.acme.example/jobs/1 or write to jobs@acme.example'];

  it('passes text with no links', () => {
    expect(noForeignLinks('letter', 'Dear team, I am keen.', allowed)).toBeNull();
  });

  it('passes a reply that quotes an allowed URL, trimmed or with www', () => {
    expect(
      noForeignLinks('letter', 'See https://careers.acme.example/jobs/1.', allowed),
    ).toBeNull();
    expect(noForeignLinks('letter', 'Visit www.careers.acme.example', allowed)).toBeNull();
    expect(noForeignLinks('letter', 'Write to jobs@acme.example', allowed)).toBeNull();
  });

  it('fails a URL, a bare domain and an email that are not in the inputs, and names them', () => {
    const reason = noForeignLinks(
      'letter',
      'Go to https://evil.example/apply, evil2.example or x@evil.example',
      allowed,
    );

    expect(reason).toContain('evil.example');
    expect(reason).toContain('evil2.example');
    expect(reason).toContain('x@evil.example');
  });

  it('fails an address at an allowed host, which the user never entered', () => {
    expect(noForeignLinks('letter', 'Write to ceo@acme.example', allowed)).toContain(
      'ceo@acme.example',
    );
  });

  it('fails everything when nothing is allowed, and passes null', () => {
    expect(noForeignLinks('letter', 'acme.example', [])).not.toBeNull();
    expect(noForeignLinks('letter', null, [])).toBeNull();
  });
});

describe('noMarkdownImages', () => {
  it('fails an inline image, a reference image and an img tag', () => {
    expect(noMarkdownImages('reply', 'Hi ![](https://evil.example/b)')).not.toBeNull();
    expect(noMarkdownImages('reply', '![badge][1]\n\n[1]: https://evil.example')).not.toBeNull();
    expect(noMarkdownImages('reply', 'Hi <IMG src="https://evil.example/b">')).not.toBeNull();
  });

  it('passes a link, a bang in prose and null', () => {
    expect(noMarkdownImages('reply', 'See [the site](https://acme.example).')).toBeNull();
    expect(noMarkdownImages('reply', 'Great news! [Read more](https://acme.example)')).toBeNull();
    expect(noMarkdownImages('reply', null)).toBeNull();
  });
});
