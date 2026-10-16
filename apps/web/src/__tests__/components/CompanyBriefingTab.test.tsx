import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { CompanyBriefingTab } from '#/routes/_authenticated/applications/$applicationId/-components/CompanyBriefingTab';

const makeClient = () =>
  new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const stored = {
  id: 'b1',
  applicationId: 'app-1',
  content: 'Company overview:\nAcme builds widgets.',
  generatedAt: '2026-08-01T09:00:00.000Z',
};

const respondWith = (briefing: unknown, generated?: unknown) =>
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('GenerateCompanyBriefing'))
      return Promise.resolve({ generateCompanyBriefing: generated ?? stored });
    return Promise.resolve({ companyBriefing: briefing });
  });

describe('CompanyBriefingTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it('shows a briefing generated in an earlier session without regenerating it', async () => {
    // The bug this fixes: the briefing used to be lost on leaving the tab, and
    // getting it back meant paying for the model call again.
    respondWith(stored);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Acme builds widgets/)).toBeInTheDocument());
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('GenerateCompanyBriefing'),
      expect.anything(),
    );
  });

  it('renders a markdown briefing as headings and lists, not raw syntax', async () => {
    respondWith({
      ...stored,
      content:
        '## Company overview\nAcme builds widgets.\n\n- **Culture**: fast\n- Interviews: 3 rounds',
    });
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Company overview' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Culture').tagName).toBe('STRONG');
    expect(screen.getByText(/Interviews: 3 rounds/).closest('li')).not.toBeNull();
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
  });

  it('keeps the line breaks of a briefing stored as plain text before markdown', async () => {
    // Old briefings are "Header:\nbody" with single newlines, which markdown
    // would otherwise fold into one run-on line.
    respondWith(stored);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    const paragraph = (await screen.findByText(/Acme builds widgets/)).closest('p')!;
    expect(paragraph.textContent).toBe('Company overview:\nAcme builds widgets.');
    expect(paragraph.parentElement?.parentElement?.className).toContain('whitespace-pre-line');
  });

  it('says when the briefing was generated, so a stale one looks stale', async () => {
    respondWith(stored);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Generated/)).toBeInTheDocument());
  });

  it('offers Generate, not Regenerate, when there is nothing stored', async () => {
    respondWith(null);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate briefing/i })).toBeInTheDocument(),
    );
  });

  it('generates and displays a briefing', async () => {
    respondWith(null);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    // Enabled, not merely present: the button stays disabled until the stored
    // briefing has loaded, so generating cannot race past the overwrite check.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate briefing/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /generate briefing/i }));

    await waitFor(() => expect(screen.getByText(/Acme builds widgets/)).toBeInTheDocument());
  });

  it('confirms before overwriting an existing briefing', async () => {
    respondWith(stored);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    // Declining must not spend the user's API quota on a replacement.
    expect(window.confirm).toHaveBeenCalled();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('GenerateCompanyBriefing'),
      expect.anything(),
    );
  });

  it('replaces the briefing once the overwrite is confirmed', async () => {
    respondWith(stored, { ...stored, content: 'Fresh research' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    await waitFor(() => expect(screen.getByText(/Fresh research/)).toBeInTheDocument());
    expect(screen.queryByText(/Acme builds widgets/)).not.toBeInTheDocument();
  });

  it('shows a link to Account settings when the AI key is not configured', async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('GenerateCompanyBriefing'))
        return Promise.reject({
          response: { errors: [{ extensions: { code: 'AI_NOT_CONFIGURED' } }] },
        });
      return Promise.resolve({ companyBriefing: null });
    });
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    // Enabled, not merely present: the button stays disabled until the stored
    // briefing has loaded, so generating cannot race past the overwrite check.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate briefing/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /generate briefing/i }));

    await waitFor(() =>
      // The href, not just the presence: before JEF-204 these pointed at
      // /settings/profile, which has never had AI settings on it.
      expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
        'href',
        '/settings/ai',
      ),
    );
  });

  it('copies the stored briefing to the clipboard', async () => {
    respondWith(stored);
    render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText(/Acme builds widgets/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(stored.content);
  });
});
