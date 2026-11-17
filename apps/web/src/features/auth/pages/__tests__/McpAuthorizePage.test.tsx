import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockUseSearch } = vi.hoisted(() => ({ mockUseSearch: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  useSearch: mockUseSearch,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { McpAuthorizePage } from '#/features/auth/pages/McpAuthorizePage';

const SEARCH = {
  client_id: 'client-1',
  redirect_uri: 'http://localhost:6274/callback',
  response_type: 'code',
  scope: 'read',
  code_challenge: 'challenge-1',
  code_challenge_method: 'S256',
  state: 'state-1',
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe('McpAuthorizePage', () => {
  const fetchMock = vi.fn();
  const assign = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseSearch.mockReturnValue(SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the requesting client and the scope it asked for', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );

    render(<McpAuthorizePage />);

    expect(await screen.findByText('Claude Desktop')).toBeInTheDocument();
    expect(screen.getByText('read')).toBeInTheDocument();
  });

  it('sends the consent token issued for this request when approving', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { redirect_to: 'http://localhost:6274/callback?code=abc' }),
    );
    render(<McpAuthorizePage />);
    await screen.findByText('Claude Desktop');

    await userEvent.click(screen.getByRole('button', { name: /allow access/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    // Without this the API refuses the approval — `approved: true` alone is
    // not consent, because any cross-site page could submit that.
    expect(JSON.parse(String(options.body))).toMatchObject({
      approved: true,
      consent_token: 'consent-1',
      client_id: 'client-1',
    });
    expect(options.credentials).toBe('include');
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('http://localhost:6274/callback?code=abc'),
    );
  });

  it('sends the denial back to the client rather than silently dropping it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { redirect_to: 'http://localhost:6274/callback?error=access_denied' }),
    );
    render(<McpAuthorizePage />);
    await screen.findByText('Claude Desktop');

    await userEvent.click(screen.getByRole('button', { name: /deny|cancel/i }));

    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toMatchObject({ approved: false });
  });

  it('disables both buttons while the decision is sent, and a double click sends it once', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    render(<McpAuthorizePage />);
    await screen.findByText('Claude Desktop');

    await userEvent.dblClick(screen.getByRole('button', { name: /allow access/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /allow access/i })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /deny|cancel/i })).toBeDisabled();
    finish(jsonResponse(200, { redirect_to: 'http://localhost:6274/callback?code=abc' }));

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    // One GET for the consent screen, one POST for the decision.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the API error when the decision is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'consent_expired' }));
    render(<McpAuthorizePage />);
    await screen.findByText('Claude Desktop');

    await userEvent.click(screen.getByRole('button', { name: /allow access/i }));

    expect(await screen.findByText('consent_expired')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows a generic error when the request itself fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client_name: 'Claude Desktop', consent_token: 'consent-1' }),
    );
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<McpAuthorizePage />);
    await screen.findByText('Claude Desktop');

    await userEvent.click(screen.getByRole('button', { name: /allow access/i }));

    expect(await screen.findByText('Unable to complete authorization.')).toBeInTheDocument();
  });

  it('offers a sign-in link back to this same authorization request when signed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'login_required' }));

    render(<McpAuthorizePage />);

    expect(await screen.findByText(/sign in to trakwyn/i)).toBeInTheDocument();
    // Losing the request here would strand the client mid-flow.
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('refuses to render a consent screen the API would not vouch for', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_client' }));

    render(<McpAuthorizePage />);

    expect(await screen.findByText('invalid_client')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /allow access/i })).not.toBeInTheDocument();
  });

  it('does not offer approval when the API returned no consent token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { client_name: 'Claude Desktop' }));

    render(<McpAuthorizePage />);

    await screen.findByText(/invalid/i);
    expect(screen.queryByRole('button', { name: /allow access/i })).not.toBeInTheDocument();
  });
});
