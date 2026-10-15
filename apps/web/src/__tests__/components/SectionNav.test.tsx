import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SectionNav } from '#/routes/_authenticated/applications/$applicationId/-components/SectionNav';
import type { SectionCounts } from '#/routes/_authenticated/applications/$applicationId/-sections';

const counts: SectionCounts = {
  notes: 3,
  interviews: 0,
  contacts: 2,
  offers: 0,
  companyBriefing: true,
  coverLetters: 0,
  resumes: 1,
  otherDocuments: 0,
};

const getNav = () => screen.getByRole('navigation', { name: 'Section navigation' });

describe('SectionNav', () => {
  it('lists every section once, marking the active one as the current page', () => {
    render(<SectionNav active="interviews" counts={counts} onOpen={() => {}} />);
    const nav = getNav();

    expect(within(nav).getAllByRole('button')).toHaveLength(10);
    expect(within(nav).getByRole('button', { name: /Interviews/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: /Notes/ })).not.toHaveAttribute('aria-current');
  });

  it('puts Overview first and shows it only from lg (JEF-403)', () => {
    render(<SectionNav active="overview" counts={counts} onOpen={() => {}} />);
    const nav = getNav();

    const [first] = within(nav).getAllByRole('button');
    expect(first).toHaveTextContent('Overview');
    expect(first).toHaveAttribute('aria-current', 'page');
    expect(first).toHaveClass('hidden', 'lg:flex');
    expect(within(nav).getByRole('button', { name: /Notes/ })).not.toHaveClass('hidden');
  });

  it('shows counts above zero and the generated marker for the briefing', () => {
    render(<SectionNav active="notes" counts={counts} onOpen={() => {}} />);
    const nav = getNav();

    expect(within(within(nav).getByRole('button', { name: /Notes/ })).getByText('3')).toBeVisible();
    expect(
      within(within(nav).getByRole('button', { name: /Interviews/ })).queryByText('0'),
    ).toBeNull();
    expect(within(nav).getByRole('img', { name: 'Generated' })).toBeInTheDocument();
  });

  it('opens the clicked section', () => {
    const onOpen = vi.fn();
    render(<SectionNav active="notes" counts={counts} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /Contacts/ }));
    expect(onOpen).toHaveBeenCalledWith('contacts');
  });

  it('becomes a horizontal bar from lg while keeping the group headings for assistive tech', () => {
    render(<SectionNav active="notes" counts={counts} onOpen={() => {}} />);
    const nav = getNav();

    expect(nav).toHaveClass('md:flex', 'lg:flex-row', 'lg:w-full', 'lg:overflow-x-auto');
    const headings = within(nav).getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(3);
    headings.forEach((h) => expect(h).toHaveClass('lg:sr-only'));
  });
});
