import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  KEEP_ALIVE_SECTIONS,
  SectionPanes,
} from '#/features/application-detail/components/sections/SectionPanes';
import type { SectionId } from '#/features/application-detail/lib/sections';
import type { Application } from '#/features/application-detail/graphql/applicationQuery';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('#/features/application-detail/components/tabs/OverviewTab', () => ({
  OverviewTab: () => <div data-testid="overview" />,
}));
vi.mock('#/features/notes/components/NotesTab', () => ({
  NotesTab: ({ enabled }: { enabled: boolean }) => (
    <div data-testid="notes" data-enabled={String(enabled)} />
  ),
}));
vi.mock('#/features/application-detail/components/tabs/ActivityTab', () => ({
  ActivityTab: () => <div data-testid="activity" />,
}));
vi.mock('#/features/interviews/components/InterviewsTab', () => ({
  InterviewsTab: ({ company }: { company: string }) => (
    <div data-testid="interviews">{company}</div>
  ),
}));
vi.mock('#/features/application-detail/components/tabs/ContactsTab', () => ({
  ContactsTab: () => <div data-testid="contacts" />,
}));
vi.mock('#/features/documents/components/DocumentList', () => ({
  DocumentList: ({ category }: { category: string }) => (
    <div data-testid={`documents-${category}`} />
  ),
}));
vi.mock('#/features/documents/components/review/ResumeGapsPanel', () => ({
  ResumeGapsPanel: () => <div data-testid="resume-gaps" />,
}));
vi.mock('#/features/application-detail/components/tabs/CompanyBriefingTab', () => ({
  CompanyBriefingTab: () => <div data-testid="briefing" />,
}));

const app: Application = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  starred: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const panes = (active: SectionId, canLoadPanels = true) => (
  <SectionPanes active={active} applicationId="app-1" app={app} canLoadPanels={canLoadPanels} />
);

describe('SectionPanes', () => {
  it('renders only the active section on first paint', () => {
    render(panes('overview'));

    expect(screen.getByTestId('overview')).toBeInTheDocument();
    expect(screen.queryByTestId('notes')).not.toBeInTheDocument();
  });

  it.each([
    ['activity', 'activity'],
    ['company-briefing', 'briefing'],
    ['contacts', 'contacts'],
    ['cover-letters', 'documents-cover_letter'],
    ['other-documents', 'documents-other'],
  ] as const)('renders the %s section', (id, testId) => {
    render(panes(id));

    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('passes the company to interviews and the load gate to notes', () => {
    const { rerender } = render(panes('interviews', false));
    expect(screen.getByTestId('interviews')).toHaveTextContent('Acme');

    rerender(panes('notes', false));
    expect(screen.getByTestId('notes')).toHaveAttribute('data-enabled', 'false');
  });

  it('puts the gaps panel above the resume list', () => {
    render(panes('resumes'));

    expect(screen.getByTestId('resume-gaps')).toBeInTheDocument();
    expect(screen.getByTestId('documents-resume')).toBeInTheDocument();
  });

  it('keeps a visited keep-alive section mounted but hidden', () => {
    const { rerender } = render(panes('notes'));
    rerender(panes('contacts'));

    expect(screen.getByTestId('notes')).toBeInTheDocument();
    expect(screen.getByTestId('contacts')).toBeInTheDocument();
  });

  it('unmounts a section that is not worth keeping', () => {
    const { rerender } = render(panes('activity'));
    rerender(panes('notes'));

    expect(screen.queryByTestId('activity')).not.toBeInTheDocument();
  });

  it('links Offers to the offers page', () => {
    render(panes('offers'));

    expect(screen.getByText('Offer comparison')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage offers' })).toHaveAttribute(
      'href',
      '/applications/$applicationId/offers',
    );
  });

  it('names the sections whose state is kept', () => {
    expect([...KEEP_ALIVE_SECTIONS].sort()).toEqual([
      'contacts',
      'cover-letters',
      'interviews',
      'notes',
      'other-documents',
      'resumes',
    ]);
  });
});
