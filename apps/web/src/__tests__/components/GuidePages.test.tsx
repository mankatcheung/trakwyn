import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    className,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: { slug: string };
    search?: { tag: string };
    className?: string;
    'aria-current'?: string;
  }) => (
    <a
      href={(params ? to.replace('$slug', params.slug) : to) + (search ? `?tag=${search.tag}` : '')}
      className={className}
      aria-current={rest['aria-current'] as 'page' | undefined}
    >
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => false }));
vi.mock('#/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('#/lib/analytics', () => ({ trackCta: vi.fn() }));
vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string, values?: Record<string, string>) =>
      Object.entries(values ?? {}).reduce(
        (text, [k, v]) => text.replace(`{{${k}}}`, v),
        (en as Record<string, string>)[key] ?? key,
      ),
    formatDate: (value: string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en', options).format(new Date(value)),
  }),
}));

import { GUIDES } from '#/lib/guides';
import { GuidePage } from '#/routes/guides/-components/GuidePage';
import { GuidesIndexPage } from '#/routes/guides/-components/GuidesIndexPage';

const first = GUIDES.find((g) => g.slug === 'track-your-first-job-application')!;

describe('GuidesIndexPage', () => {
  it('lists every published guide as a link to its page', () => {
    render(<GuidesIndexPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guides' })).toBeInTheDocument();
    for (const guide of GUIDES) {
      expect(
        screen.getByRole('link', { name: new RegExp(guide.frontmatter.title) }),
      ).toHaveAttribute('href', `/guides/${guide.slug}`);
    }
  });

  it('filters by tag and marks the active filter', () => {
    render(<GuidesIndexPage tag="ai" />);
    expect(screen.getByRole('link', { name: /Tailor a cover letter/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Track your first job application/ })).toBeNull();
    const filters = screen.getByRole('navigation', { name: 'Filter by topic' });
    expect(filters.querySelector('[aria-current="page"]')?.textContent).toBe('ai');
  });

  it('shows All as active with no tag, and offers the RSS feed', () => {
    render(<GuidesIndexPage />);
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'RSS feed' })).toHaveAttribute(
      'href',
      '/guides/rss.xml',
    );
  });

  it('shows an empty state for a tag nothing has', () => {
    render(<GuidesIndexPage tag="nothing" />);
    expect(screen.getByText('No guides yet. Check back soon.')).toBeInTheDocument();
  });
});

describe('GuidePage', () => {
  it('renders the guide with its Article JSON-LD', () => {
    const { container } = render(<GuidePage guide={first} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Track your first job application' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    const ld = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    expect(ld['@type']).toBe('Article');
    expect(ld.headline).toBe('Track your first job application');
  });

  it('links to the related feature and to sign-up', () => {
    render(<GuidePage guide={first} />);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'Application tracking' })).toHaveAttribute(
      'href',
      '/features/tracking',
    );
    expect(main.getByRole('link', { name: 'Start for free' })).toHaveAttribute('href', '/register');
  });

  it('omits the related feature when the guide names none', () => {
    const plain = { ...first, frontmatter: { ...first.frontmatter, feature: undefined } };
    render(<GuidePage guide={plain} />);
    expect(screen.queryByText(/Related feature/)).toBeNull();
  });
});
