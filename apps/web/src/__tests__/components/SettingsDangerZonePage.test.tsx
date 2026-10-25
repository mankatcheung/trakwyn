import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockNavigate } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

import { SettingsDangerZonePage } from '#/routes/_authenticated/settings/-components/SettingsDangerZonePage';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Answers the billing status query with `status`, and the deletion with `deletion`. */
function serve(
  status: { plan: 'free' | 'pro'; planSource: string | null },
  deletion: () => Promise<unknown> = () => Promise.resolve({ deleteAccount: true }),
) {
  mockGqlRequest.mockImplementation((query: string) =>
    query.includes('BillingStatus')
      ? Promise.resolve({ billingStatus: { enforced: false, ...status } })
      : deletion(),
  );
}

const refusal = (message: string, code: string) =>
  Object.assign(new Error(message), { response: { errors: [{ message, extensions: { code } }] } });

const NOTE = /active subscription, it is cancelled straight away/i;

describe('SettingsDangerZonePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells a subscriber that their subscription is cancelled with the account', async () => {
    serve({ plan: 'pro', planSource: 'subscription' });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it.each([
    ['a free user', { plan: 'free' as const, planSource: null }],
    ['a pass holder', { plan: 'pro' as const, planSource: 'pass' }],
  ])('says nothing about a subscription to %s', async (_label, status) => {
    serve(status);
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await screen.findByRole('button', { name: 'Delete my account' });
    // Let the billing status query settle before asserting that nothing appeared.
    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("shows the API's message, and stays on the page, when the subscription cannot be cancelled", async () => {
    const message = 'We could not cancel your subscription. Try again, or contact support.';
    serve({ plan: 'pro', planSource: 'subscription' }, () =>
      Promise.reject(refusal(message, 'SERVICE_UNAVAILABLE')),
    );
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await userEvent.type(await screen.findByPlaceholderText('••••••••'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('goes to the login page once the account is deleted', async () => {
    serve({ plan: 'free', planSource: null });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await userEvent.type(await screen.findByPlaceholderText('••••••••'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' }));
  });
});
