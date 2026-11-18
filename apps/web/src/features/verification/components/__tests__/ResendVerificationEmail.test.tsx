import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResendVerificationEmail } from '#/features/verification/components/ResendVerificationEmail';
import { RESEND_COOLDOWN_SECONDS } from '#/features/verification/graphql/emailVerification';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

const gqlError = (code: string) => ({
  response: { errors: [{ message: 'x', extensions: { code } }] },
});

const resendButton = () => screen.getByRole('button', { name: /Resend|Sending/ });

/**
 * Moves the clock once the countdown is running. `useCooldown` starts its interval in
 * an effect, which React flushes through a (faked) `setImmediate`; jumping the clock
 * before that effect has run moves time with no interval to tick, and the label stays
 * at the full cooldown. So wait for the interval, then advance asynchronously.
 */
async function advanceCountdown(ms: number) {
  await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockGqlRequest.mockResolvedValue({ resendVerificationEmail: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ResendVerificationEmail', () => {
  it('offers to resend and shows no notice at first', () => {
    render(<ResendVerificationEmail email="me@example.com" />);

    expect(resendButton()).toHaveTextContent('Resend verification email');
    expect(resendButton()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says it is sending, with the button locked, while the request runs', async () => {
    let finish!: () => void;
    mockGqlRequest.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());

    await waitFor(() => expect(resendButton()).toHaveTextContent('Sending…'));
    expect(resendButton()).toBeDisabled();

    await act(async () => finish());
  });

  it('confirms where the link went, then counts down before it can be asked for again', async () => {
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());

    expect(
      await screen.findByText('A new link is on its way to me@example.com.'),
    ).toBeInTheDocument();
    expect(resendButton()).toHaveTextContent(`Resend in ${RESEND_COOLDOWN_SECONDS}s`);
    expect(resendButton()).toBeDisabled();

    await advanceCountdown(RESEND_COOLDOWN_SECONDS * 1000 + 1000);
    expect(resendButton()).toHaveTextContent('Resend verification email');
    expect(resendButton()).toBeEnabled();
  });

  it('ticks the countdown down each second', async () => {
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());
    await screen.findByText(/A new link is on its way/);
    await advanceCountdown(10_000);

    expect(resendButton().textContent).toMatch(/Resend in (49|50)s/);
  });

  it('says to wait when the server is rate limiting, and does not start the countdown', async () => {
    mockGqlRequest.mockRejectedValue(gqlError('RATE_LIMITED'));
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());

    expect(await screen.findByText(/asked for several links already/)).toBeInTheDocument();
    expect(resendButton()).toBeEnabled();
  });

  it('says it could not send for any other failure', async () => {
    mockGqlRequest.mockRejectedValue(new Error('offline'));
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());

    expect(await screen.findByText(/couldn't send the email/)).toBeInTheDocument();
    expect(screen.queryByText(/on its way/)).not.toBeInTheDocument();
    expect(resendButton()).toBeEnabled();
  });

  it('clears the last notice when it is tried again', async () => {
    mockGqlRequest.mockRejectedValueOnce(new Error('offline'));
    render(<ResendVerificationEmail email="me@example.com" />);

    fireEvent.click(resendButton());
    await screen.findByText(/couldn't send the email/);
    fireEvent.click(resendButton());

    await waitFor(() =>
      expect(screen.queryByText(/couldn't send the email/)).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/on its way/)).toBeInTheDocument();
  });
});
