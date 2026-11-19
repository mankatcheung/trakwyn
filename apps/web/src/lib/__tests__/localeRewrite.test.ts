import { describe, expect, it } from 'vitest';
import { createLocaleRewrite, localizedHref } from '#/lib/localeRewrite';

const ORIGIN = 'https://www.trakwyn.com';

function run(
  direction: 'input' | 'output',
  href: string,
  currentLocale: unknown = undefined,
): string | undefined {
  const rewrite = createLocaleRewrite(() => currentLocale);
  const result = rewrite[direction]({ url: new URL(href, ORIGIN) });
  return result ? `${result.pathname}${result.search}${result.hash}` : undefined;
}

describe('input: public URL → the router', () => {
  it('strips the prefix and carries the locale as ?locale=', () => {
    expect(run('input', '/zh-hk/pricing')).toBe('/pricing?locale=zh-HK');
    expect(run('input', '/zh-tw/features/tracking')).toBe('/features/tracking?locale=zh-TW');
  });

  it('maps a locale root to the home page', () => {
    expect(run('input', '/zh-cn')).toBe('/?locale=zh-CN');
  });

  it('keeps other query params and the hash', () => {
    expect(run('input', '/zh-hk/guides?tag=ai#top')).toBe('/guides?tag=ai&locale=zh-HK#top');
  });

  it('lets the prefix win over a ?locale= already on the URL', () => {
    expect(run('input', '/zh-hk/pricing?locale=zh-CN')).toBe('/pricing?locale=zh-HK');
  });

  it('leaves English and unlocalized pages alone', () => {
    expect(run('input', '/pricing')).toBeUndefined();
    expect(run('input', '/login?locale=zh-HK')).toBeUndefined();
  });

  it('leaves what must 404 alone: unknown prefixes, auth pages and guide articles', () => {
    expect(run('input', '/xx/pricing')).toBeUndefined();
    expect(run('input', '/zh-hk/login')).toBeUndefined();
    expect(run('input', '/zh-hk/guides/some-guide')).toBeUndefined();
  });
});

describe('output: the router → public URL', () => {
  it('prefixes a localized page that names a locale', () => {
    expect(run('output', '/pricing?locale=zh-HK')).toBe('/zh-hk/pricing');
    expect(run('output', '/?locale=zh-TW')).toBe('/zh-tw');
  });

  it('inherits the current page locale when the link names none', () => {
    expect(run('output', '/features', 'zh-CN')).toBe('/zh-cn/features');
    expect(run('output', '/', 'zh-HK')).toBe('/zh-hk');
  });

  it('lets a link choose a locale over the current one', () => {
    expect(run('output', '/pricing?locale=en', 'zh-HK')).toBe('/pricing');
    expect(run('output', '/pricing?locale=zh-TW', 'zh-HK')).toBe('/zh-tw/pricing');
  });

  it('keeps other query params and the hash, and drops only ?locale=', () => {
    expect(run('output', '/guides?tag=ai&locale=zh-HK#top')).toBe('/zh-hk/guides?tag=ai#top');
  });

  it('leaves English links as they are', () => {
    expect(run('output', '/pricing')).toBeUndefined();
    expect(run('output', '/pricing', 'en')).toBeUndefined();
  });

  it('gives en-GB, which has no URLs of its own, the English page', () => {
    expect(run('output', '/pricing?locale=en-GB')).toBe('/pricing');
    expect(run('output', '/pricing', 'en-GB')).toBeUndefined();
  });

  it('does not touch pages that are not localized', () => {
    expect(run('output', '/login', 'zh-HK')).toBeUndefined();
    expect(run('output', '/login?locale=zh-HK')).toBeUndefined();
    expect(run('output', '/guides/some-guide', 'zh-HK')).toBeUndefined();
    expect(run('output', '/dashboard', 'zh-HK')).toBeUndefined();
  });

  it('round-trips with input', () => {
    const internal = run('input', '/zh-tw/features/analytics');
    expect(run('output', internal as string)).toBe('/zh-tw/features/analytics');
  });
});

describe('localizedHref', () => {
  const at = (pathname: string, searchStr = '', hash = '') => ({ pathname, searchStr, hash });

  it('is the page in the chosen language', () => {
    expect(localizedHref(at('/pricing'), 'zh-HK')).toBe('/zh-hk/pricing');
    expect(localizedHref(at('/features/tracking', '?locale=zh-TW'), 'zh-CN')).toBe(
      '/zh-cn/features/tracking',
    );
    expect(localizedHref(at('/', '?locale=zh-HK'), 'zh-TW')).toBe('/zh-tw');
  });

  it('goes back to the unprefixed English URL', () => {
    expect(localizedHref(at('/pricing', '?locale=zh-HK'), 'en')).toBe('/pricing');
  });

  it('keeps other query params and the hash', () => {
    expect(localizedHref(at('/guides', '?tag=ai&locale=zh-HK', '#top'), 'zh-TW')).toBe(
      '/zh-tw/guides?tag=ai#top',
    );
    expect(localizedHref(at('/pricing', '', 'faq'), 'zh-HK')).toBe('/zh-hk/pricing#faq');
  });

  it('gives en-GB the English URL with no query: its language is kept in storage (JEF-654)', () => {
    expect(localizedHref(at('/pricing', '?locale=zh-HK'), 'en-GB')).toBe('/pricing');
    expect(localizedHref(at('/guides', '?tag=ai&locale=zh-HK', '#top'), 'en-GB')).toBe(
      '/guides?tag=ai#top',
    );
  });

  it('has nothing to say for a page without per-locale URLs', () => {
    expect(localizedHref(at('/guides/some-guide'), 'zh-HK')).toBeUndefined();
    expect(localizedHref(at('/dashboard'), 'zh-HK')).toBeUndefined();
  });
});
