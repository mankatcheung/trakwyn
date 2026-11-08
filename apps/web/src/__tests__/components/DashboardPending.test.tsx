import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPending } from '#/routes/_authenticated/-components/DashboardPending';

describe('DashboardPending (JEF-535)', () => {
  it('shows the dashboard heading and a busy placeholder while the loader runs', () => {
    render(<DashboardPending />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-pending')).toHaveAttribute('aria-busy', 'true');
  });
});
