import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isNotFound } from '@tanstack/react-router';

const { mockGetGuide } = vi.hoisted(() => ({ mockGetGuide: vi.fn() }));

vi.mock('#/lib/guides', () => ({ getGuide: mockGetGuide }));
vi.mock('../../features/guides/pages/GuidePage', () => ({
  GuidePage: ({ guide }: { guide: { slug: string } }) => <p>{guide.slug}</p>,
}));

type Options = {
  component: () => React.ReactNode;
  beforeLoad: (opts: { params: { slug: string } }) => unknown;
  head: (opts: { params: { slug: string } }) => {
    meta?: Array<Record<string, string>>;
  };
};

async function loadOptions(): Promise<Options> {
  const mod = await import('#/routes/guides/$slug');
  return (mod.Route as unknown as { options: Options }).options;
}

const GUIDE = {
  slug: 'track-applications',
  frontmatter: { title: 'Track applications', description: 'How to track them.' },
};

describe('/guides/$slug route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGuide.mockImplementation((slug: string) => (slug === GUIDE.slug ? GUIDE : undefined));
  });

  it('throws notFound for an unknown slug', async () => {
    const { beforeLoad } = await loadOptions();

    let caught: unknown;
    try {
      beforeLoad({ params: { slug: 'nope' } });
    } catch (err) {
      caught = err;
    }

    expect(isNotFound(caught)).toBe(true);
  });

  it('lets a known slug render', async () => {
    const { beforeLoad } = await loadOptions();

    expect(() => beforeLoad({ params: { slug: GUIDE.slug } })).not.toThrow();
  });

  it('sets the guide title and description and marks the page an article', async () => {
    const { head } = await loadOptions();

    const { meta = [] } = head({ params: { slug: GUIDE.slug } });

    expect(meta).toContainEqual({ title: 'Track applications — Trakwyn' });
    expect(meta).toContainEqual({ name: 'description', content: 'How to track them.' });
    expect(meta).toContainEqual({ property: 'og:type', content: 'article' });
    expect(meta.filter((tag) => tag.property === 'og:type')).toHaveLength(1);
  });

  it('adds no head tags for an unknown slug', async () => {
    const { head } = await loadOptions();

    expect(head({ params: { slug: 'nope' } })).toEqual({});
  });

  describe('component', () => {
    async function renderFor(slug: string) {
      const mod = await import('#/routes/guides/$slug');
      vi.spyOn(mod.Route, 'useParams').mockReturnValue({ slug } as never);
      const { component: Component } = (mod.Route as unknown as { options: Options }).options;
      return () => render(<Component />);
    }

    it('renders the guide page for a known slug', async () => {
      const run = await renderFor(GUIDE.slug);

      run();

      expect(screen.getByText('track-applications')).toBeTruthy();
    });

    it('throws notFound if the guide vanished after beforeLoad', async () => {
      const run = await renderFor('nope');

      let caught: unknown;
      try {
        run();
      } catch (err) {
        caught = err;
      }

      expect(isNotFound(caught)).toBe(true);
    });
  });
});
