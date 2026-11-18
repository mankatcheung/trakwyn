import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from '#/features/application-detail/components/tabs/OverviewTab';
import type { Application } from '#/features/application-detail/graphql/applicationQuery';

vi.mock('#/features/application-detail/components/header/ApplicationJobInfo', () => ({
  ApplicationJobInfo: ({
    app,
    collapseDescription,
  }: {
    app: Application;
    collapseDescription: boolean;
  }) => (
    <div data-testid="job-info" data-collapse={String(collapseDescription)}>
      {app.company}
    </div>
  ),
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

describe('OverviewTab', () => {
  it('shows the job information uncollapsed, since the tab has room for all of it', () => {
    render(<OverviewTab app={app} />);

    const info = screen.getByTestId('job-info');
    expect(info).toHaveTextContent('Acme');
    expect(info).toHaveAttribute('data-collapse', 'false');
  });

  it('follows the application when it changes', () => {
    const { rerender } = render(<OverviewTab app={app} />);

    rerender(<OverviewTab app={app} />);
    expect(screen.getByTestId('job-info')).toHaveTextContent('Acme');

    rerender(<OverviewTab app={{ ...app, company: 'Globex' }} />);
    expect(screen.getByTestId('job-info')).toHaveTextContent('Globex');
  });
});
