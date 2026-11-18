import { describe, expect, it } from 'vitest';
import {
  INDEXED_LOCALES,
  LOCALIZED_PATHS,
  indexedLocale,
  isLocalizedPath,
  localeFromPathname,
  localizedAlternates,
  localizedPath,
  localizedRouteRules,
  parseLocalizedPath,
  stripLocalePrefix,
} from '#/lib/localePaths';

describe('indexedLocale', () => {
  it('accepts the locales that have URLs of their own', () => {
    for (const locale of INDEXED_LOCALES) expect(indexedLocale(locale)).toBe(locale);
  });

  it('rejects en-GB (no URLs of its own), unknown values and non-strings', () => {
    expect(indexedLocale('en-GB')).toBeUndefined();
    expect(indexedLocale('fr')).toBeUndefined();
    expect(indexedLocale(undefined)).toBeUndefined();
    expect(indexedLocale(42)).toBeUndefined();
  });
});

describe('localizedPath', () => {
  it('leaves English at the root', () => {
    expect(localizedPath('/pricing', 'en')).toBe('/pricing');
    expect(localizedPath('/', 'en')).toBe('/');
  });

  it('prefixes the other locales with a lowercase segment', () => {
    expect(localizedPath('/pricing', 'zh-HK')).toBe('/zh-hk/pricing');
    expect(localizedPath('/features/tracking', 'zh-TW')).toBe('/zh-tw/features/tracking');
    expect(localizedPath('/features', 'zh-CN')).toBe('/zh-cn/features');
  });

  it('maps the home page to the bare prefix', () => {
    expect(localizedPath('/', 'zh-HK')).toBe('/zh-hk');
  });

  it('ignores a trailing slash', () => {
    expect(localizedPath('/pricing/', 'zh-HK')).toBe('/zh-hk/pricing');
  });

  it('leaves a page that is not localized alone', () => {
    expect(localizedPath('/login', 'zh-HK')).toBe('/login');
    expect(localizedPath('/guides/some-guide', 'zh-TW')).toBe('/guides/some-guide');
  });
});

describe('parseLocalizedPath', () => {
  it.each([
    ['/zh-hk/pricing', 'zh-HK', '/pricing'],
    ['/zh-tw/features/analytics', 'zh-TW', '/features/analytics'],
    ['/zh-cn', 'zh-CN', '/'],
    ['/zh-cn/', 'zh-CN', '/'],
    ['/zh-hk/pricing/', 'zh-HK', '/pricing'],
    ['/zh-hk/guides', 'zh-HK', '/guides'],
  ])('reads %s', (pathname, locale, path) => {
    expect(parseLocalizedPath(pathname)).toEqual({ locale, path });
  });

  it.each([
    '/pricing',
    '/',
    '/xx/pricing',
    '/ZH-HK/pricing',
    '/zh-hk/login',
    '/zh-hk/guides/some-guide',
    '/zh-hk/zh-hk/pricing',
    '/constructor/pricing',
    '',
  ])('does not read %s', (pathname) => {
    expect(parseLocalizedPath(pathname)).toBeUndefined();
  });
});

describe('localeFromPathname and stripLocalePrefix', () => {
  it('names the locale of a prefixed page', () => {
    expect(localeFromPathname('/zh-tw/pricing')).toBe('zh-TW');
    expect(localeFromPathname('/pricing')).toBeUndefined();
  });

  it('takes a prefix off a localized page and nothing else', () => {
    expect(stripLocalePrefix('/zh-hk/pricing')).toBe('/pricing');
    expect(stripLocalePrefix('/pricing')).toBe('/pricing');
    expect(stripLocalePrefix('/zh-hk/dashboard')).toBe('/zh-hk/dashboard');
  });
});

describe('localizedAlternates', () => {
  it('lists every indexed locale, English first', () => {
    expect(localizedAlternates('/pricing')).toEqual([
      { locale: 'en', path: '/pricing' },
      { locale: 'zh-HK', path: '/zh-hk/pricing' },
      { locale: 'zh-TW', path: '/zh-tw/pricing' },
      { locale: 'zh-CN', path: '/zh-cn/pricing' },
    ]);
  });
});

describe('localizedRouteRules', () => {
  const rules = localizedRouteRules();

  it('prerenders every non-English locale of every localized page', () => {
    expect(Object.keys(rules)).toHaveLength((INDEXED_LOCALES.length - 1) * LOCALIZED_PATHS.length);
    expect(rules['/zh-hk/pricing']).toEqual({ prerender: true });
    expect(rules['/zh-tw']).toEqual({ prerender: true });
    expect(rules['/zh-cn/features/resume-cover-letter']).toEqual({ prerender: true });
  });

  it('leaves English to the hand-written list', () => {
    expect(rules).not.toHaveProperty('/pricing');
    expect(rules).not.toHaveProperty('/');
  });

  it('only lists paths the rewrite will accept', () => {
    for (const path of Object.keys(rules)) expect(parseLocalizedPath(path)).toBeDefined();
  });
});

describe('isLocalizedPath', () => {
  it('is true for each localized page, trailing slash or not', () => {
    for (const path of LOCALIZED_PATHS) {
      expect(isLocalizedPath(path)).toBe(true);
      expect(isLocalizedPath(`${path}/`)).toBe(true);
    }
  });

  it('is false for auth, app and guide-article pages', () => {
    for (const path of ['/login', '/register', '/dashboard', '/guides/some-guide', '/share']) {
      expect(isLocalizedPath(path)).toBe(false);
    }
  });
});
