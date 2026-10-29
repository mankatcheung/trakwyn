import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import {
  useStepUpReauth,
  STEP_UP_CANCELLED,
} from '#/routes/_authenticated/settings/-components/useStepUpReauth';

const stepUpRequiredError = {
  response: {
    errors: [
      {
        message: 'Please verify your identity again to continue.',
        extensions: { code: 'STEP_UP_REQUIRED' },
      },
    ],
  },
};

function Harness({
  fn,
  onResolve,
  onReject,
}: {
  fn: () => Promise<unknown>;
  onResolve: (v: unknown) => void;
  onReject: (e: unknown) => void;
}) {
  const { withStepUp, dialog } = useStepUpReauth();
  useEffect(() => {
    withStepUp(fn).then(onResolve, onReject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div>{dialog}</div>;
}

describe('useStepUpReauth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with the original result when no reauth is required', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const onResolve = vi.fn();
    const onReject = vi.fn();

    render(<Harness fn={fn} onResolve={onResolve} onReject={onReject} />);

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('ok');
    });
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
  });

  it('rejects with the original error when it is not STEP_UP_REQUIRED', async () => {
    const originalError = new Error('some other failure');
    const fn = vi.fn().mockRejectedValue(originalError);
    const onResolve = vi.fn();
    const onReject = vi.fn();

    render(<Harness fn={fn} onResolve={onResolve} onReject={onReject} />);

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith(originalError);
    });
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
  });

  it('shows the reauth dialog on STEP_UP_REQUIRED and retries the call on success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(stepUpRequiredError).mockResolvedValueOnce('retried');
    const onResolve = vi.fn();
    const onReject = vi.fn();

    render(<Harness fn={fn} onResolve={onResolve} onReject={onReject} />);

    await waitFor(() => {
      expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
    });

    mockGqlRequest.mockResolvedValue({
      reauthenticate: { success: true, totpRequired: false, accessToken: 'new-access-token' },
    });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'mypassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith('retried');
    });
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('shows a two-factor code field when reauthenticate reports totpRequired', async () => {
    const fn = vi.fn().mockRejectedValueOnce(stepUpRequiredError).mockResolvedValueOnce('retried');
    render(<Harness fn={fn} onResolve={vi.fn()} onReject={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
    });

    mockGqlRequest.mockResolvedValueOnce({
      reauthenticate: { success: false, totpRequired: true, accessToken: null },
    });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'mypassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /verify code/i })).toBeInTheDocument();
  });

  it('rejects with STEP_UP_CANCELLED when the dialog is dismissed', async () => {
    const fn = vi.fn().mockRejectedValueOnce(stepUpRequiredError);
    const onResolve = vi.fn();
    const onReject = vi.fn();

    render(<Harness fn={fn} onResolve={onResolve} onReject={onReject} />);

    await waitFor(() => {
      expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith(
        expect.objectContaining({ message: STEP_UP_CANCELLED }),
      );
    });
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
  });

  describe('accounts without a password (JEF-463)', () => {
    // clearAllMocks keeps implementations; these tests set one per operation.
    afterEach(() => mockGqlRequest.mockReset());

    /** Answers by operation, so the order the hook asks in does not matter. */
    function serve(handlers: Record<string, () => Promise<unknown>>) {
      mockGqlRequest.mockImplementation((query: string) => {
        const name = Object.keys(handlers).find((key) => query.includes(key));
        return name ? handlers[name]!() : Promise.reject(new Error(`unexpected: ${query}`));
      });
    }

    it('sends the browser to Google with a step-up ticket and the page to return to', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', {
        ...window.location,
        assign,
        pathname: '/settings/danger-zone',
        search: '',
      });
      serve({
        StepUpMethods: () => Promise.resolve({ me: { stepUpMethods: ['google', 'email_code'] } }),
        StartOAuthReauth: () => Promise.resolve({ startOAuthReauth: 'ticket-1' }),
      });
      const fn = vi.fn().mockRejectedValueOnce(stepUpRequiredError);
      render(<Harness fn={fn} onResolve={vi.fn()} onReject={vi.fn()} />);

      fireEvent.click(await screen.findByRole('button', { name: /continue with google/i }));

      await waitFor(() => expect(assign).toHaveBeenCalled());
      const url = new URL(assign.mock.calls[0]![0] as string, 'https://api.example');
      expect(url.pathname).toBe('/auth/oauth/google/start');
      expect(url.searchParams.get('mode')).toBe('reauth');
      expect(url.searchParams.get('ticket')).toBe('ticket-1');
      expect(url.searchParams.get('returnTo')).toBe('/settings/danger-zone');
      vi.unstubAllGlobals();
    });

    it('mails a code, checks it, then retries the original call', async () => {
      serve({
        StepUpMethods: () => Promise.resolve({ me: { stepUpMethods: ['email_code'] } }),
        RequestStepUpCode: () => Promise.resolve({ requestStepUpCode: true }),
        VerifyStepUpCode: () => Promise.resolve({ verifyStepUpCode: true }),
      });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(stepUpRequiredError)
        .mockResolvedValueOnce('retried');
      const onResolve = vi.fn();
      render(<Harness fn={fn} onResolve={onResolve} onReject={vi.fn()} />);

      expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
      fireEvent.click(await screen.findByRole('button', { name: /email me a code/i }));
      fireEvent.change(await screen.findByLabelText('Code from the email'), {
        target: { value: ' 123456 ' },
      });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

      await waitFor(() => expect(onResolve).toHaveBeenCalledWith('retried'));
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('VerifyStepUpCode'), {
        code: '123456',
      });
    });

    it('says, on returning from Google, that it worked, and clears the marker', async () => {
      window.history.replaceState(null, '', '/settings/danger-zone?stepUp=1');
      render(
        <Harness fn={vi.fn().mockResolvedValue('ok')} onResolve={vi.fn()} onReject={vi.fn()} />,
      );

      expect(await screen.findByText(/that's confirmed/i)).toBeInTheDocument();
      expect(window.location.search).toBe('');
    });
  });

  it('shows an inline error and keeps the dialog open when reauth itself fails', async () => {
    const fn = vi.fn().mockRejectedValueOnce(stepUpRequiredError);
    render(<Harness fn={fn} onResolve={vi.fn()} onReject={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
    });

    mockGqlRequest.mockRejectedValueOnce({
      response: { errors: [{ message: 'Incorrect password.' }] },
    });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect password.')).toBeInTheDocument();
    });
    expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
  });
});
