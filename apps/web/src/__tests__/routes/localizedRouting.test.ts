import { afterEach, describe, expect, it } from 'vitest';
import { localizedHref } from '#/lib/localeRewrite';
import { getRouter } from '#/router';

/**
 * The localized marketing URLs through the real route tree and the router's
 * rewrite (JEF-653). `localeRewrite.test.ts` pins the rewrite functions in
 * isolation; this pins that the router actually applies them: a prefixed URL
 * lands on the one route that serves the page, in the right language, with the
 * head a crawler reads, and the links built from it keep the language.
 */

async function open(href: string) {
  window.history.replaceState({}, '', href);
  const router = await getRouter();
  await router.load();
  return router;
}

function metaValue(meta: ReadonlyArray<object | undefined>, key: string): unknown {
  const tags = meta as ReadonlyArray<Record<string, unknown> | undefined>;
  return tags.find((m) => m && (m.name === key || m.property === key))?.content;
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('a prefixed URL', () => {
  it('is the same route, rendered for its locale', async () => {
    const router = await open('/zh-hk/pricing');
    const { location, matches } = router.state;

    expect(location.pathname).toBe('/pricing');
    expect(location.search).toMatchObject({ locale: 'zh-HK' });
    expect(location.publicHref).toBe('/zh-hk/pricing');
    expect(matches.at(-1)?.routeId).toBe('/pricing');
    expect(matches[0].context).toMatchObject({ pageLocale: 'zh-HK' });
  });

  it('has a head in that language, with its own canonical and every alternate', async () => {
    const router = await open('/zh-tw/features/tracking');
    const leaf = router.state.matches.at(-1);
    const meta = leaf?.meta ?? [];
    const links = leaf?.links ?? [];

    expect(metaValue(meta, 'og:title')).toBe('申請追蹤與看板 — Trakwyn');
    expect(metaValue(meta, 'og:locale')).toBe('zh_TW');
    expect(links).toContainEqual({
      rel: 'canonical',
      href: 'https://www.trakwyn.com/zh-tw/features/tracking',
    });
    expect(links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://www.trakwyn.com/features/tracking',
    });
    expect(links.filter((l) => l?.rel === 'alternate')).toHaveLength(5);
  });

  it('serves the home page at the bare prefix', async () => {
    const router = await open('/zh-cn');
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.matches.at(-1)?.routeId).toBe('/');
    expect(router.state.matches[0].context).toMatchObject({ pageLocale: 'zh-CN' });
  });

  it('gives the picker the URL of the same page in another language', async () => {
    const router = await open('/zh-hk/features/tracking');

    expect(localizedHref(router.latestLocation, 'zh-TW')).toBe('/zh-tw/features/tracking');
    expect(localizedHref(router.latestLocation, 'en')).toBe('/features/tracking');
    expect(localizedHref(router.latestLocation, 'en-GB')).toBe('/features/tracking');
  });

  it('keeps links inside the language, and leaves non-marketing links alone', async () => {
    const router = await open('/zh-hk/pricing');

    expect(router.buildLocation({ to: '/features' }).publicHref).toBe('/zh-hk/features');
    expect(router.buildLocation({ to: '/' }).publicHref).toBe('/zh-hk');
    expect(router.buildLocation({ to: '/login' }).publicHref).toBe('/login');
    expect(router.buildLocation({ to: '/guides/$slug', params: { slug: 'x' } }).publicHref).toBe(
      '/guides/x',
    );
  });
});

describe('an unprefixed URL', () => {
  it('is English, and its links stay English', async () => {
    const router = await open('/pricing');
    const leaf = router.state.matches.at(-1);

    expect(router.state.location.publicHref).toBe('/pricing');
    expect(router.state.matches[0].context).toMatchObject({ pageLocale: 'en' });
    expect(metaValue(leaf?.meta ?? [], 'og:title')).toBe('Pricing — Trakwyn');
    expect(leaf?.links).toContainEqual({
      rel: 'canonical',
      href: 'https://www.trakwyn.com/pricing',
    });
    expect(router.buildLocation({ to: '/features' }).publicHref).toBe('/features');
  });

  it('treats the legacy ?locale= as the language it names, canonical at the prefixed URL', async () => {
    const router = await open('/pricing?locale=zh-TW');
    const leaf = router.state.matches.at(-1);

    expect(router.state.matches[0].context).toMatchObject({ pageLocale: 'zh-TW' });
    expect(leaf?.links).toContainEqual({
      rel: 'canonical',
      href: 'https://www.trakwyn.com/zh-tw/pricing',
    });
  });

  it('falls back to English for en-GB, which has no pages of its own', async () => {
    const router = await open('/pricing?locale=en-GB');
    expect(router.state.matches[0].context).toMatchObject({ pageLocale: 'en' });
  });
});

describe('a URL that is not a localized page', () => {
  // An unmatched URL is left with only the root match, which is what renders
  // the not-found page. A page that genuinely does not exist is the control.
  it.each([
    '/definitely-not-a-page',
    '/xx/pricing',
    '/zh-hk/login',
    '/zh-hk/dashboard',
    '/zh-hk/guides/some-guide',
  ])('%s matches no route', async (href) => {
    const router = await open(href);
    expect(router.state.matches.map((m) => m.routeId)).toEqual(['__root__']);
  });
});
