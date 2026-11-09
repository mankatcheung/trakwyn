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

const credits = vi.hoisted(() => ({ onTrakwynAi: false }));

vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: credits.onTrakwynAi,
    needsSetup: false,
    view: null,
    costOf: () => (credits.onTrakwynAi ? 1 : null),
    canAfford: () => true,
    refresh: () => Promise.resolve(),
  }),
}));
vi.mock('#/components/AiCreditsMeter', () => ({ AiCreditsMeter: () => null }));

const makeClient = () =>
  new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const stored = {
  id: 'b1',
  applicationId: 'app-1',
  content: 'Company overview:\nAcme builds widgets.',
  sources: [] as Array<{ url: string; title: string; publishedAt?: string | null }>,
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
    credits.onTrakwynAi = false;
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

  describe('sources (JEF-475)', () => {
    const withSources = {
      ...stored,
      content: 'Acme sells payroll software [1].',
      sources: [
        { url: 'https://acme.com', title: 'Acme | Payroll' },
        { url: 'https://acme.com/about', title: 'About Acme' },
      ],
    };

    it('asks the API for the sources', async () => {
      respondWith(null);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('sources { url title publishedAt }'),
          { applicationId: 'app-1' },
        ),
      );
    });

    it('lists the pages the briefing was written from, numbered to match its citations', async () => {
      respondWith(withSources);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      const list = await screen.findByTestId('briefing-sources');
      const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toEqual(['[1]Acme | Payroll', '[2]About Acme']);
    });

    it('opens each source in a new tab without handing over the opener', async () => {
      respondWith(withSources);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      const link = await screen.findByRole('link', { name: 'Acme | Payroll' });
      expect(link).toHaveAttribute('href', 'https://acme.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('does not turn a stored value that is not a web address into a link', async () => {
      respondWith({
        ...withSources,
        sources: [{ url: 'javascript:alert(1)', title: 'Sneaky' }],
      });
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      expect(await screen.findByText('Sneaky')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Sneaky' })).not.toBeInTheDocument();
    });

    it('says the briefing used the listed sources when it has some', async () => {
      respondWith(withSources);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      expect(await screen.findByText(/sources listed below/)).toBeInTheDocument();
      expect(screen.queryByText(/not live data/)).not.toBeInTheDocument();
    });

    describe('web search sources (JEF-538)', () => {
      const withSearch = {
        ...withSources,
        content: 'Acme raised a Series B, reported March 2026 [3].',
        sources: [
          ...withSources.sources,
          {
            url: 'https://news.example/acme',
            title: 'Acme raises Series B',
            publishedAt: '2026-03-12T00:00:00.000Z',
          },
          { url: 'https://reviews.example/acme', title: 'Acme reviews', publishedAt: null },
        ],
      };

      it('shows when a search source was published, beside its title', async () => {
        respondWith(withSearch);
        render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

        const list = await screen.findByTestId('briefing-sources');
        const item = Array.from(list.querySelectorAll('li'))[2];
        const date = item.querySelector('time');

        expect(item.textContent).toContain('Acme raises Series B');
        expect(date).toHaveAttribute('datetime', '2026-03-12T00:00:00.000Z');
        expect(date?.textContent).toMatch(/2026/);
      });

      it('shows no date for a page from the company’s site, or a search result with none', async () => {
        respondWith(withSearch);
        render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

        const list = await screen.findByTestId('briefing-sources');
        const items = Array.from(list.querySelectorAll('li'));

        expect(items.map((li) => li.querySelector('time') !== null)).toEqual([
          false,
          false,
          true,
          false,
        ]);
      });
    });

    it('keeps the general-knowledge disclaimer and shows no list when there are none', async () => {
      respondWith(stored);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      expect(await screen.findByText(/not live data/)).toBeInTheDocument();
      expect(screen.queryByTestId('briefing-sources')).not.toBeInTheDocument();
    });

    it('shows the sources of a freshly generated briefing', async () => {
      respondWith(null, withSources);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate briefing/i })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /generate briefing/i }));

      expect(await screen.findByTestId('briefing-sources')).toBeInTheDocument();
    });
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

  describe('instructions and credits (JEF-507)', () => {
    it('sends the instructions typed with the generate mutation', async () => {
      respondWith(null);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      const box = await screen.findByLabelText('Instructions (optional)');
      fireEvent.change(box, { target: { value: '  focus on remote culture  ' } });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate briefing/i })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /generate briefing/i }));

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('GenerateCompanyBriefing'),
          { applicationId: 'app-1', instructions: 'focus on remote culture' },
        ),
      );
    });

    it('sends null when the box is left empty', async () => {
      respondWith(null);
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate briefing/i })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /generate briefing/i }));

      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('GenerateCompanyBriefing'),
          { applicationId: 'app-1', instructions: null },
        ),
      );
    });

    it('shows the cost on Trakwyn AI and nothing with the user’s own key', async () => {
      respondWith(null);
      const { unmount } = render(<CompanyBriefingTab applicationId="app-1" />, {
        wrapper: Wrapper,
      });
      expect(screen.queryByText(/Uses \d+ credit/)).not.toBeInTheDocument();
      unmount();

      credits.onTrakwynAi = true;
      render(<CompanyBriefingTab applicationId="app-1" />, { wrapper: Wrapper });
      expect(await screen.findByText('Uses 1 credit')).toBeInTheDocument();
    });
  });
});
