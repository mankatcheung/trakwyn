import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { mockReporter, mockReloader, mockIsStale } = vi.hoisted(() => ({
  mockReporter: vi.fn(),
  mockReloader: vi.fn(),
  mockIsStale: vi.fn(),
}));

vi.mock('#/components/RouteErrorReporter', () => ({
  RouteErrorReporter: ({ error }: { error: unknown }) => {
    mockReporter(error);
    return null;
  },
}));

vi.mock('#/components/StaleChunkReloader', () => ({
  StaleChunkReloader: ({ error }: { error: unknown }) => {
    mockReloader(error);
    return null;
  },
}));

vi.mock('#/lib/staleChunkReload', () => ({
  isStaleChunkError: mockIsStale,
}));

import { RouteErrorPage } from '#/features/app-shell/pages/RouteErrorPage';

describe('RouteErrorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsStale.mockReturnValue(false);
  });

  it('shows the error screen with a reload button and a dashboard link', () => {
    render(<RouteErrorPage error={new Error('boom')} />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('reports a real error and hands it to the stale-chunk reloader', () => {
    const error = new Error('boom');
    render(<RouteErrorPage error={error} />);

    expect(mockReporter).toHaveBeenCalledWith(error);
    expect(mockReloader).toHaveBeenCalledWith(error);
  });

  it('does not report a stale chunk error, only reloads', () => {
    mockIsStale.mockReturnValue(true);
    const error = new Error('Failed to fetch dynamically imported module');
    render(<RouteErrorPage error={error} />);

    expect(mockReporter).not.toHaveBeenCalled();
    expect(mockReloader).toHaveBeenCalledWith(error);
  });

  it('reloads the window when Reload is pressed', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<RouteErrorPage error={new Error('boom')} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
