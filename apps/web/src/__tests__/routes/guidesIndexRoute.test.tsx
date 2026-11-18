import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../features/guides/pages/GuidesIndexPage', () => ({
  GuidesIndexPage: ({ tag }: { tag?: string }) => <p>{tag}</p>,
}));

type Options = {
  component: () => React.ReactNode;
  validateSearch: (search: Record<string, unknown>) => { tag?: string };
  head: () => { meta?: Array<Record<string, string>> };
};

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

    const { meta = [] } = head();

    expect(meta).toContainEqual({ title: 'Guides — Trakwyn' });
    expect(meta).toContainEqual({ property: 'og:type', content: 'website' });
  });

  it('passes the tag from the search to the page', async () => {
    const mod = await import('#/routes/guides/index');
    vi.spyOn(mod.Route, 'useSearch').mockReturnValue({ tag: 'resume' } as never);
    const { component: Component } = (mod.Route as unknown as { options: Options }).options;

    render(<Component />);

    expect(screen.getByText('resume')).toBeTruthy();
  });
});
