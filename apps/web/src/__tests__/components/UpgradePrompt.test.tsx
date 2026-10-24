import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { UpgradePrompt } from '#/components/UpgradePrompt';
import { ErrorState } from '#/components/ErrorState';
import { AiErrorMessage } from '#/components/AiErrorMessage';

const planRequired = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'PLAN_REQUIRED' } }] },
});

describe('UpgradePrompt', () => {
  it('shows the message and points at the plan page', () => {
    render(<UpgradePrompt message="Analytics is a Pro feature" />);

    expect(screen.getByText('Analytics is a Pro feature')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });
});

describe('ErrorState with a PLAN_REQUIRED error', () => {
  it('shows the upgrade prompt with the API message instead of a retry', () => {
    render(<ErrorState error={planRequired('Offer tools is a Pro feature')} onRetry={vi.fn()} />);

    expect(screen.getByText('Offer tools is a Pro feature')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('still shows a retry for any other failure', () => {
    const error = {
      response: { errors: [{ message: 'x', extensions: { code: 'INTERNAL_ERROR' } }] },
    };
    render(<ErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('AiErrorMessage with PLAN_REQUIRED', () => {
  it('shows the Free allowance message and a link to the plans', () => {
    render(
      <AiErrorMessage
        code="PLAN_REQUIRED"
        fallback="The Free plan includes 5 AI actions a month. Upgrade to Pro for unlimited AI."
      />,
    );

    expect(screen.getByText(/The Free plan includes 5 AI actions a month/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });

  it('does not tell a user at their allowance to add an API key', () => {
    render(<AiErrorMessage code="PLAN_REQUIRED" fallback="Upgrade" />);

    expect(screen.queryByText(/Add your AI API key/)).not.toBeInTheDocument();
  });
});
