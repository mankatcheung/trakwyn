import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { SettingsDangerZonePage } from '#/routes/_authenticated/settings/-components/SettingsDangerZonePage';

const EMAIL = 'jeff@example.com';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

type Handler = () => Promise<unknown>;

/** Answers each operation by name; anything not named fails the test loudly. */
function serve(handlers: {
  plan?: { plan: 'free' | 'pro'; planSource: string | null };
  request?: Handler;
  methods?: string[];
  reauthenticate?: Handler;
}) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('BillingStatus')) {
      return Promise.resolve({
        billingStatus: {
          enforced: false,
          ...(handlers.plan ?? { plan: 'free', planSource: null }),
        },
      });
    }
    if (query.includes('EmailVerification')) {
      return Promise.resolve({
        me: { email: EMAIL, emailVerified: true, deletionScheduledAt: null },
      });
    }
    if (query.includes('RequestAccountDeletion')) {
      return (handlers.request ?? (() => Promise.resolve({ requestAccountDeletion: true })))();
    }
    if (query.includes('StepUpMethods')) {
      return Promise.resolve({ me: { stepUpMethods: handlers.methods ?? ['password'] } });
    }
    if (query.includes('Reauthenticate') && handlers.reauthenticate) {
      return handlers.reauthenticate();
    }
    return Promise.reject(new Error(`unexpected operation: ${query}`));
  });
}

const refusal = (message: string, code: string) =>
  Object.assign(new Error(message), { response: { errors: [{ message, extensions: { code } }] } });

const NOTE = /subscription stops renewing when you confirm/i;
const deleteButton = () => screen.getByRole('button', { name: 'Delete my account' });

async function typeEmail(value = EMAIL) {
  await userEvent.type(await screen.findByLabelText(`Type ${EMAIL} to confirm`), value);
}

describe('SettingsDangerZonePage (JEF-463)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells a subscriber that the subscription stops renewing', async () => {
    serve({ plan: { plan: 'pro', planSource: 'subscription' } });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it.each([
    ['a free user', { plan: 'free' as const, planSource: null }],
    ['a pass holder', { plan: 'pro' as const, planSource: 'pass' }],
  ])('says nothing about a subscription to %s', async (_label, plan) => {
    serve({ plan });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('asks for no password, and keeps the button off until the email is typed exactly', async () => {
    serve({});
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail('jeff@example.co');
    expect(deleteButton()).toBeDisabled();
    expect(screen.queryByPlaceholderText('••••••••')).toBeNull();

    await userEvent.type(screen.getByLabelText(`Type ${EMAIL} to confirm`), 'm');
    expect(deleteButton()).toBeEnabled();
  });

  it('requests the deletion and says to check the inbox, deleting nothing itself', async () => {
    serve({});
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail(EMAIL.toUpperCase());
    await userEvent.click(deleteButton());

    expect(await screen.findByText(new RegExp(`Check ${EMAIL}`))).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestAccountDeletion'));
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('deleteAccount'),
      expect.anything(),
    );
  });

  it('steps up on a stale session, then sends the request again', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        refusal('Please verify your identity again to continue.', 'STEP_UP_REQUIRED'),
      )
      .mockResolvedValueOnce({ requestAccountDeletion: true });
    serve({
      request,
      reauthenticate: () =>
        Promise.resolve({
          reauthenticate: { success: true, totpRequired: false, accessToken: null },
        }),
    });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail();
    await userEvent.click(deleteButton());
    await userEvent.type(await screen.findByPlaceholderText('••••••••'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByText(new RegExp(`Check ${EMAIL}`))).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('offers Google and an emailed code, not a password, to an account without one', async () => {
    serve({
      methods: ['google', 'email_code'],
      request: () =>
        Promise.reject(
          refusal('Please verify your identity again to continue.', 'STEP_UP_REQUIRED'),
        ),
    });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail();
    await userEvent.click(deleteButton());

    expect(
      await screen.findByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('••••••••')).toBeNull();
  });

  it("shows the API's message and stays put when the request is refused", async () => {
    const message = 'We could not send the confirmation email. Try again shortly.';
    serve({ request: () => Promise.reject(refusal(message, 'SERVICE_UNAVAILABLE')) });
    render(<SettingsDangerZonePage />, { wrapper: Wrapper });

    await typeEmail();
    await userEvent.click(deleteButton());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
  });
});
