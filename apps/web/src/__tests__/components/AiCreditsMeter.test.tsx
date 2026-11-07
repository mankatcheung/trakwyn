import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import en from '#/i18n/en.json';

const billing = vi.hoisted(() => ({ status: null as unknown }));

vi.mock('#/lib/billingStatus', () => ({ useBillingStatus: () => billing.status }));
vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string, o?: Record<string, unknown>) =>
      Object.entries(o ?? {}).reduce(
        (text, [k, v]) => text.replace(`{{${k}}}`, String(v)),
        (en as Record<string, string>)[key] ?? key,
      ),
  }),
}));

import { AiCreditsMeter } from '#/components/AiCreditsMeter';

const withCredits = (used: number) => {
  billing.status = {
    aiCredits: { used, limit: 30, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
  };
};

describe('AiCreditsMeter', () => {
  beforeEach(() => {
    billing.status = null;
  });

  it('renders nothing while billing status is loading', () => {
    const { container } = render(<AiCreditsMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a number and the reset date in settings, whatever is left', () => {
    withCredits(18);
    render(<AiCreditsMeter />);
    expect(screen.getByText('12 of 30 AI credits left')).toBeInTheDocument();
    expect(screen.getByText('Resets December 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '18');
    expect(screen.queryByText(/used most/)).not.toBeInTheDocument();
  });

  it('warns from 80% used', () => {
    withCredits(25);
    render(<AiCreditsMeter />);
    expect(screen.getByText(/used most of this month/)).toBeInTheDocument();
  });

  it('keeps the assistant hint quiet above 30% left', () => {
    withCredits(18);
    const { container } = render(<AiCreditsMeter variant="hint" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the assistant hint below 30% left', () => {
    withCredits(23);
    render(<AiCreditsMeter variant="hint" />);
    expect(screen.getByRole('status')).toHaveTextContent('7 of 30 AI credits left');
  });

  // The inline variant (JEF-506) sits next to an AI action.
  it('inline: is always visible, even with plenty left, as one compact line', () => {
    withCredits(2);
    render(<AiCreditsMeter variant="inline" />);
    expect(screen.getByRole('status')).toHaveTextContent('28 of 30 AI credits left');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('inline: turns red when nothing is left', () => {
    withCredits(30);
    render(<AiCreditsMeter variant="inline" />);
    expect(screen.getByRole('status')).toHaveClass('text-red-600');
  });

  it('inline: keeps its tone when a caller adds a class', () => {
    withCredits(30);
    render(<AiCreditsMeter variant="inline" className="pt-2" />);
    expect(screen.getByRole('status')).toHaveClass('text-red-600', 'pt-2');
  });

  it('inline: renders nothing when the plan has no credits', () => {
    billing.status = {
      aiCredits: { used: 0, limit: 0, bonusRemaining: 0, resetsAt: '2026-12-01T00:00:00.000Z' },
    };
    const { container } = render(<AiCreditsMeter variant="inline" />);
    expect(container).toBeEmptyDOMElement();
  });
});
