import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen, within } from '@testing-library/react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    // Resolve against the real English bundle so assertions on rendered copy
    // keep working as keys are added (falls back to the key itself).
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { ClipperSection } from '#/components/marketing/ClipperSection';

describe('ClipperSection (JEF-424)', () => {
  it('points the shared listing URL at the Web Store detail page', () => {
    expect(CLIPPER_WEB_STORE_URL).toBe(
      'https://chromewebstore.google.com/detail/pnpgngnojencbggokjhpfhmliijakmhe',
    );
  });

  it('opens the Web Store listing in a new tab from the "Add to Chrome" button', () => {
    render(<ClipperSection />);

    const cta = screen.getByRole('link', { name: 'Add to Chrome' });
    expect(cta).toHaveAttribute('href', CLIPPER_WEB_STORE_URL);
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('tells non-Chrome visitors which browsers are supported without detecting the browser', () => {
    render(<ClipperSection />);

    expect(screen.getByText(/Chrome and Chromium browsers \(Edge, Brave\) for now/)).toBeVisible();
  });

  it('lists every job board the Clipper supports', () => {
    render(<ClipperSection />);

    const boards = within(screen.getByRole('list', { name: 'Supported job boards' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(boards).toEqual(['LinkedIn', 'Indeed', 'Glassdoor', 'Greenhouse', 'Lever', 'Workday']);
  });

  it('labels the section with its heading', () => {
    render(<ClipperSection />);

    expect(screen.getByRole('region', { name: 'Clip jobs as you browse' })).toBeInTheDocument();
  });
});
