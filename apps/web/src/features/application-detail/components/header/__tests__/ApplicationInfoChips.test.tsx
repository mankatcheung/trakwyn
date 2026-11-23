import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicationInfoChips } from '#/features/application-detail/components/header/ApplicationInfoChips';
import type { Application } from '#/features/application-detail/graphql/applicationQuery';

const baseApp: Application = {
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  starred: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const dateText = (iso: string) => new RegExp(new Date(iso).toLocaleDateString());

afterEach(() => {
  vi.useRealTimers();
});

describe('ApplicationInfoChips', () => {
  it('renders an empty row when the application has no facts', () => {
    const { container } = render(<ApplicationInfoChips app={baseApp} />);

    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('shows location, salary, source, tags and the applied date', () => {
    render(
      <ApplicationInfoChips
        app={{
          ...baseApp,
          location: 'Berlin',
          salaryRange: '€80-90k',
          source: 'LinkedIn',
          tags: ['remote', 'startup'],
          appliedAt: '2026-03-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('€80-90k')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();
    expect(screen.getByText('startup')).toBeInTheDocument();
    expect(screen.getByText(dateText('2026-03-04T12:00:00.000Z'))).toBeInTheDocument();
  });

  it('updates the chips when the application changes', () => {
    const { rerender } = render(<ApplicationInfoChips app={{ ...baseApp, location: 'Berlin' }} />);
    rerender(<ApplicationInfoChips app={{ ...baseApp, location: 'Berlin' }} />);
    expect(screen.getByText('Berlin')).toBeInTheDocument();

    rerender(
      <ApplicationInfoChips
        app={{ ...baseApp, location: 'Paris', source: 'Referral', tags: ['remote'] }}
      />,
    );
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();

    rerender(<ApplicationInfoChips app={baseApp} />);
    expect(screen.queryByText('Paris')).not.toBeInTheDocument();
  });

  it('flags a follow-up that is due in the warning tone', () => {
    vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') });
    render(<ApplicationInfoChips app={{ ...baseApp, followUpAt: '2026-06-01T12:00:00.000Z' }} />);

    expect(screen.getByText(dateText('2026-06-01T12:00:00.000Z'))).toHaveClass('bg-amber-100');
  });

  it('keeps a follow-up that is still ahead in the neutral tone', () => {
    vi.useFakeTimers({ now: new Date('2026-06-10T12:00:00.000Z') });
    render(<ApplicationInfoChips app={{ ...baseApp, followUpAt: '2026-06-20T12:00:00.000Z' }} />);

    const chip = screen.getByText(dateText('2026-06-20T12:00:00.000Z'));
    expect(chip).not.toHaveClass('bg-amber-100');
    expect(chip).toHaveClass('bg-stone-100');
  });
});
