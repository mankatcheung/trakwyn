import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionIndex } from '#/features/application-detail/components/sections/SectionIndex';
import type { SectionCounts } from '#/features/application-detail/lib/sections';

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

describe('SectionIndex', () => {
  it('lists the nine phone sections, leaving out the wide-only Overview', () => {
    render(<SectionIndex counts={counts} onOpen={() => {}} />);

    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.queryByRole('button', { name: /Overview/ })).not.toBeInTheDocument();
  });

  it('opens the section whose row is pressed', () => {
    const onOpen = vi.fn();
    render(<SectionIndex counts={counts} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /Contacts/ }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('contacts');
  });

  it('shows a count badge only for sections that have items', () => {
    render(<SectionIndex counts={counts} onOpen={() => {}} />);

    expect(screen.getByRole('button', { name: /Notes/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /Interviews/ })).not.toHaveTextContent(/\d/);
  });

  it('marks the briefing as generated or not instead of counting it', () => {
    const { rerender } = render(<SectionIndex counts={counts} onOpen={() => {}} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/not/i);

    rerender(<SectionIndex counts={{ ...counts, companyBriefing: false }} onOpen={() => {}} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/not/i);
  });

  it('updates the badges when the counts arrive or change', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<SectionIndex onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Notes/ })).not.toHaveTextContent(/\d/);

    rerender(<SectionIndex counts={counts} onOpen={onOpen} />);
    rerender(<SectionIndex counts={counts} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Notes/ })).toHaveTextContent('3');

    rerender(<SectionIndex counts={{ ...counts, notes: 7 }} onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Notes/ })).toHaveTextContent('7');
  });

  it('shows no counts or markers while the counts are still loading', () => {
    render(<SectionIndex onOpen={() => {}} />);

    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notes/ })).not.toHaveTextContent(/\d/);
  });
});
