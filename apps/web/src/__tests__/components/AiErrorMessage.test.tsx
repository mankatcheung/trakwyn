import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

const capture = vi.hoisted(() => vi.fn());
vi.mock('#/lib/analytics/analytics', async (orig) => ({
  ...(await orig<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: capture,
}));

import { AiErrorMessage } from '#/components/AiErrorMessage';
import { AI_LIMIT_REACHED_CODE, AI_NOT_CONFIGURED_CODE } from '#/lib/graphqlError';

describe('AiErrorMessage', () => {
  it('tells a user with no key to add one', () => {
    render(<AiErrorMessage code={AI_NOT_CONFIGURED_CODE} fallback="boom" />);

    expect(screen.getByText(/Add your AI API key/)).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  /**
   * The distinction this component exists for: someone at their limit already
   * has a key, so "add your API key" would be the wrong instruction.
   */
  it('tells a user at their limit to raise it, not to add a key', () => {
    render(<AiErrorMessage code={AI_LIMIT_REACHED_CODE} fallback="boom" />);

    expect(screen.getByText(/reached its monthly token limit/)).toBeInTheDocument();
    expect(screen.queryByText(/Add your AI API key/)).not.toBeInTheDocument();
  });

  it('points both cases at the AI settings page', () => {
    const { unmount } = render(<AiErrorMessage code={AI_NOT_CONFIGURED_CODE} fallback="boom" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/settings/ai');
    unmount();

    render(<AiErrorMessage code={AI_LIMIT_REACHED_CODE} fallback="boom" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/settings/ai');
  });

  it('shows the underlying message for anything else', () => {
    render(<AiErrorMessage code="SOMETHING_ELSE" fallback="Provider timed out" />);

    expect(screen.getByText('Provider timed out')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the underlying message when there is no code at all', () => {
    render(<AiErrorMessage code={undefined} fallback="Network error" />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  describe('hosted AI (JEF-451)', () => {
    it('keeps the API message with the reset date and offers both ways forward', async () => {
      capture.mockClear();
      render(
        <AiErrorMessage code="AI_CREDITS_EXHAUSTED" fallback="They reset on December 1, 2026." />,
      );

      expect(screen.getByText(/They reset on December 1, 2026\./)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Upgrade to Pro' })).toHaveAttribute(
        'href',
        '/settings/plan',
      );
      expect(screen.getByRole('link', { name: 'Add your own key' })).toHaveAttribute(
        'href',
        '/settings/ai',
      );
      expect(capture).toHaveBeenCalledWith('ai_credits_exhausted_shown');

      await userEvent.click(screen.getByRole('link', { name: 'Upgrade to Pro' }));
      await userEvent.click(screen.getByRole('link', { name: 'Add your own key' }));
      expect(capture).toHaveBeenCalledWith('ai_upgrade_clicked');
      expect(capture).toHaveBeenCalledWith('ai_add_key_clicked');
    });

    it('points an unverified email at the verification page', () => {
      render(<AiErrorMessage code="EMAIL_NOT_VERIFIED" fallback="boom" />);
      expect(screen.getByRole('link', { name: 'Verify email' })).toHaveAttribute(
        'href',
        '/verify-email-required',
      );
    });

    it('says Trakwyn AI is busy, not that anything is wrong with the account', () => {
      render(<AiErrorMessage code="AI_TEMPORARILY_UNAVAILABLE" fallback="boom" />);
      expect(screen.getByText(/Trakwyn AI is busy/)).toBeInTheDocument();
    });
  });
});
