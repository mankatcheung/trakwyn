import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuideMarkdown } from '#/components/marketing/GuideMarkdown';

const SLUG = 'track-your-first-job-application';

describe('GuideMarkdown', () => {
  it('renders headings, lists and GFM tables', () => {
    render(
      <GuideMarkdown slug={SLUG}>
        {'## Step one\n\n- a\n- b\n\n| x | y |\n| - | - |\n| 1 | 2 |'}
      </GuideMarkdown>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Step one' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('turns a relative image into the hashed URL, lazy, with its size reserved', () => {
    render(<GuideMarkdown slug={SLUG}>{'![The board](./board.webp)'}</GuideMarkdown>);
    const img = screen.getByRole('img', { name: 'The board' });
    expect(img.getAttribute('src')).toMatch(/board.*\.webp$/);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '1600');
    expect(img).toHaveAttribute('height', '1000');
  });

  it('drops an image that resolves to no file instead of a broken link', () => {
    render(<GuideMarkdown slug={SLUG}>{'![Gone](./gone.webp)'}</GuideMarkdown>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens external links in a new tab and keeps internal links in the page', () => {
    render(
      <GuideMarkdown slug={SLUG}>
        {'[out](https://example.com) and [in](/features/tracking)'}
      </GuideMarkdown>,
    );
    const out = screen.getByRole('link', { name: 'out' });
    expect(out).toHaveAttribute('target', '_blank');
    expect(out).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'in' })).not.toHaveAttribute('target');
  });

  it('does not render raw HTML or script links', () => {
    const { container } = render(
      <GuideMarkdown slug={SLUG}>
        {'<script>alert(1)</script>\n\n[x](javascript:alert(1))'}
      </GuideMarkdown>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('x').closest('a')?.getAttribute('href') ?? '').not.toContain(
      'javascript:',
    );
  });
});
