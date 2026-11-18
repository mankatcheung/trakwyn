import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ensureLocaleLoaded } from '#/lib/i18n';
import type { IndexedLocale } from '#/lib/localePaths';

vi.mock('../../features/guides/pages/GuidesIndexPage', () => ({
  GuidesIndexPage: ({ tag }: { tag?: string }) => <p>{tag}</p>,
}));

type HeadContext = { match: { context: { pageLocale: IndexedLocale } } };

type Options = {
  component: () => React.ReactNode;
  validateSearch: (search: Record<string, unknown>) => { tag?: string };
  head: (ctx: HeadContext) => {
    meta?: Array<Record<string, string>>;
    links?: Array<Record<string, string>>;
  };
};

/** What the router hands `head()`: the root route's `pageLocale` in the match context. */
function headContext(pageLocale: IndexedLocale): HeadContext {
  return { match: { context: { pageLocale } } };
}

async function loadOptions(): Promise<Options> {
  const mod = await import('#/routes/guides/index');
  return (mod.Route as unknown as { options: Options }).options;
}

describe('/guides route', () => {
  it('keeps a non-empty string tag', async () => {
    const { validateSearch } = await loadOptions();

    expect(validateSearch({ tag: 'resume' })).toEqual({ tag: 'resume' });
  });

  it.each([
    ['an empty string', ''],
    ['a number', 5],
    ['an array', ['a']],
    ['null', null],
    ['missing', undefined],
  ])('drops a tag that is %s', async (_label, tag) => {
    const { validateSearch } = await loadOptions();

    expect(validateSearch({ tag }).tag).toBeUndefined();
  });

  it('builds its head from marketingHead for /guides', async () => {
    const { head } = await loadOptions();

    const { meta = [] } = head(headContext('en'));

    expect(meta).toContainEqual({ title: 'Guides — Trakwyn' });
    expect(meta).toContainEqual({ property: 'og:type', content: 'website' });
  });

  // The locale comes from the root route's context (JEF-653), not from the
  // route itself, so the same head serves /guides and /zh-hk/guides.
  it('builds the head in the page locale', async () => {
    await ensureLocaleLoaded('zh-HK');
    const { head } = await loadOptions();

    const { meta = [], links = [] } = head(headContext('zh-HK'));

    expect(meta).toContainEqual({ title: '指南 — Trakwyn' });
    expect(links).toContainEqual({
      rel: 'canonical',
      href: 'https://www.trakwyn.com/zh-hk/guides',
    });
  });

  it('passes the tag from the search to the page', async () => {
    const mod = await import('#/routes/guides/index');
    vi.spyOn(mod.Route, 'useSearch').mockReturnValue({ tag: 'resume' } as never);
    const { component: Component } = (mod.Route as unknown as { options: Options }).options;

    render(<Component />);

    expect(screen.getByText('resume')).toBeTruthy();
  });
});
