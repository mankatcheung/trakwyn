import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicationJobInfo } from '#/features/application-detail/components/header/ApplicationJobInfo';
import type { Application } from '#/features/application-detail/graphql/applicationQuery';

vi.mock('#/features/documents/components/review/PostingRequirementsPanel', () => ({
  PostingRequirementsPanel: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="posting-requirements">{applicationId}</div>
  ),
}));

vi.mock('#/features/documents/components/review/HealthScorePanel', () => ({
  HealthScorePanel: () => <div data-testid="health-score" />,
}));

vi.mock('#/features/application-detail/components/header/CollapsibleDescription', () => ({
  CollapsibleDescription: ({ text }: { text: string }) => <p data-testid="collapsible">{text}</p>,
}));

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

const healthScore = { score: 80 } as never;

describe('ApplicationJobInfo', () => {
  it('shows only the chips when the application carries nothing else', () => {
    render(<ApplicationJobInfo app={baseApp} collapseDescription={false} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('posting-requirements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('health-score')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collapsible')).not.toBeInTheDocument();
  });

  it('links the posting in a new tab', () => {
    render(
      <ApplicationJobInfo
        app={{ ...baseApp, jobUrl: 'https://acme.test/jobs/1' }}
        collapseDescription={false}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://acme.test/jobs/1' });
    expect(link).toHaveAttribute('href', 'https://acme.test/jobs/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('clamps the description on the phone card', () => {
    render(
      <ApplicationJobInfo app={{ ...baseApp, description: 'Build things' }} collapseDescription />,
    );

    expect(screen.getByTestId('collapsible')).toHaveTextContent('Build things');
    expect(screen.getByTestId('posting-requirements')).toHaveTextContent('app-1');
  });

  it('shows the whole description in the Overview tab', () => {
    render(
      <ApplicationJobInfo
        app={{ ...baseApp, description: 'Build things' }}
        collapseDescription={false}
      />,
    );

    expect(screen.getByText('Build things')).toBeInTheDocument();
    expect(screen.queryByTestId('collapsible')).not.toBeInTheDocument();
  });

  it('offers the requirements panel for pasted posting text alone', () => {
    render(
      <ApplicationJobInfo
        app={{ ...baseApp, postingText: 'We are hiring' }}
        collapseDescription={false}
      />,
    );

    expect(screen.getByTestId('posting-requirements')).toBeInTheDocument();
  });

  it('adds the reminder note when a follow-up is set', () => {
    render(
      <ApplicationJobInfo
        app={{ ...baseApp, followUpAt: '2030-01-01T00:00:00.000Z' }}
        collapseDescription={false}
      />,
    );

    expect(screen.getByText(/reminder/i)).toBeInTheDocument();
  });

  it('updates when the application, the clamp or the score change', () => {
    const { rerender } = render(
      <ApplicationJobInfo app={{ ...baseApp, description: 'One' }} collapseDescription />,
    );
    rerender(<ApplicationJobInfo app={{ ...baseApp, description: 'One' }} collapseDescription />);
    expect(screen.getByTestId('collapsible')).toHaveTextContent('One');

    rerender(
      <ApplicationJobInfo
        app={{ ...baseApp, description: 'Two', jobUrl: 'https://acme.test/2' }}
        healthScore={healthScore}
        collapseDescription={false}
      />,
    );
    expect(screen.queryByTestId('collapsible')).not.toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://acme.test/2' })).toBeInTheDocument();
    expect(screen.getByTestId('health-score')).toBeInTheDocument();
  });

  it('renders the health score when one is passed', () => {
    render(
      <ApplicationJobInfo app={baseApp} healthScore={healthScore} collapseDescription={false} />,
    );

    expect(screen.getByTestId('health-score')).toBeInTheDocument();
  });
});
