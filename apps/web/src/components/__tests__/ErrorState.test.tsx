import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '#/components/ErrorState';

describe('ErrorState', () => {
  it('renders the generic error message for a plain string error', () => {
    render(<ErrorState error="Network timeout" />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('renders the generic error message for an Error instance', () => {
    render(<ErrorState error={new Error('Not found')} />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('renders the network error message for a TypeError', () => {
    render(<ErrorState error={new TypeError('fetch failed')} />);
    expect(
      screen.getByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });

  it('renders the error message from a GraphQL error with a known code', () => {
    const gqlError = {
      response: {
        errors: [{ message: 'Rate limited', extensions: { code: 'RATE_LIMITED' } }],
      },
    };
    render(<ErrorState error={gqlError} />);
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
  });

  it('shows a NOT_FOUND override message', () => {
    const gqlError = {
      response: {
        errors: [{ message: 'Application not found', extensions: { code: 'NOT_FOUND' } }],
      },
    };
    render(<ErrorState error={gqlError} />);
    expect(
      screen.getByText("That item couldn't be found — it may have been deleted."),
    ).toBeInTheDocument();
  });

  it('shows a FORBIDDEN override message', () => {
    const gqlError = {
      response: {
        errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
      },
    };
    render(<ErrorState error={gqlError} />);
    expect(screen.getByText("You don't have permission to do that.")).toBeInTheDocument();
  });

  it('renders the retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<ErrorState error="fail" onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: /try again/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render the retry button when onRetry is not provided', () => {
    render(<ErrorState error="fail" />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('renders the alert triangle icon', () => {
    const { container } = render(<ErrorState error="fail" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
