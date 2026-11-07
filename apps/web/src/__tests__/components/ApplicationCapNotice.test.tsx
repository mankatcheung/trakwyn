import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ApplicationCapNotice } from '#/components/ApplicationCapNotice';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serve(used: number, limit: number | null, enforced = true) {
  mockGqlRequest.mockResolvedValue({
    billingStatus: { enforced, limits: { applications: limit }, usage: { applications: used } },
  });
}

describe('ApplicationCapNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns from 80% of the limit and links to the plan page', async () => {
    serve(40, 50);
    render(<ApplicationCapNotice />, { wrapper: Wrapper });

    expect(await screen.findByText(/used 40 of 50 applications/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute(
      'href',
      '/settings/plan',
    );
  });

  it('stays silent below 80%', async () => {
    serve(39, 50);
    render(<ApplicationCapNotice />, { wrapper: Wrapper });

    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(screen.queryByText(/applications on your plan/)).not.toBeInTheDocument();
  });

  it('leaves the cap itself to the new-application form', async () => {
    serve(50, 50);
    render(<ApplicationCapNotice />, { wrapper: Wrapper });

    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(screen.queryByText(/applications on your plan/)).not.toBeInTheDocument();
  });

  it('stays silent with no limit or where plans are not enforced', async () => {
    serve(900, null);
    const { unmount } = render(<ApplicationCapNotice />, { wrapper: Wrapper });
    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(screen.queryByText(/applications on your plan/)).not.toBeInTheDocument();
    unmount();

    serve(45, 50, false);
    render(<ApplicationCapNotice />, { wrapper: Wrapper });
    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/applications on your plan/)).not.toBeInTheDocument();
  });
});
