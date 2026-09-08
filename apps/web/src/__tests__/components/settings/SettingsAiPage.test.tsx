import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => vi.fn(),
  redirect: vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsAiPage } from '#/routes/_authenticated/settings/-components/SettingsAiPage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

/**
 * `Menu` renders a dropdown at `sm` and up and a bottom sheet below it, off
 * `matchMedia` — which jsdom does not implement. Without this every row menu
 * would open as a portalled sheet and `within(row)` would stop finding it.
 */
function stubWideViewport() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

/**
 * Row actions moved behind a menu in JEF-258. The dropdown is portalled to
 * `document.body` so it can escape the settings card's `overflow-hidden`, so
 * the trigger is found within the row but the items are found on the page.
 */
async function chooseRowAction(
  user: ReturnType<typeof userEvent.setup>,
  row: HTMLElement,
  name: string,
) {
  await user.click(within(row).getByRole('button', { name: 'Key actions' }));
  await user.click(screen.getByRole('menuitem', { name }));
}

describe('SettingsAiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubWideViewport();
    mockGqlRequest.mockResolvedValue({
      llmApiKeys: [],
      me: { defaultLlmProvider: null, customAiPrompt: null },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the AI features section', async () => {
    render(<SettingsAiPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalled();
    });
    expect(screen.getByText('AI features')).toBeInTheDocument();
  });

  it('shows a loading state before the add-key form, instead of flashing it open', async () => {
    let resolveKeys!: (value: {
      llmApiKeys: never[];
      me: { defaultLlmProvider: null; customAiPrompt: null };
    }) => void;
    mockGqlRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveKeys = resolve;
      }),
    );

    render(<SettingsAiPage />, { wrapper: Wrapper });

    expect(screen.queryByPlaceholderText('sk-…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add provider' })).not.toBeInTheDocument();

    resolveKeys({
      llmApiKeys: [],
      me: { defaultLlmProvider: null, customAiPrompt: null },
    });

    expect(await screen.findByPlaceholderText('sk-…')).toBeInTheDocument();
  });

  describe('cross-application context (JEF-249)', () => {
    it('renders unchecked by default', async () => {
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const toggle = await screen.findByRole('checkbox', {
        name: 'Use context from other applications',
      });
      expect(toggle).not.toBeChecked();
    });

    it('reflects the saved preference when already enabled', async () => {
      mockGqlRequest.mockResolvedValue({
        llmApiKeys: [],
        me: { defaultLlmProvider: null, customAiPrompt: null, useCrossApplicationContext: true },
      });
      render(<SettingsAiPage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(
          screen.getByRole('checkbox', { name: 'Use context from other applications' }),
        ).toBeChecked();
      });
    });

    it('saves the preference immediately when toggled', async () => {
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const toggle = await screen.findByRole('checkbox', {
        name: 'Use context from other applications',
      });

      await user.click(toggle);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UpdateProfile'), {
          useCrossApplicationContext: true,
        });
      });
    });

    it('shows an error and leaves the toggle usable when the save fails', async () => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('UpdateProfile')) {
          return Promise.reject(new Error('network error'));
        }
        return Promise.resolve({
          llmApiKeys: [],
          me: { defaultLlmProvider: null, customAiPrompt: null, useCrossApplicationContext: false },
        });
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const toggle = await screen.findByRole('checkbox', {
        name: 'Use context from other applications',
      });

      await user.click(toggle);

      expect(
        await screen.findByText("Couldn't update this setting. Please try again."),
      ).toBeInTheDocument();
      expect(toggle).toBeEnabled();
    });
  });

  it('points to the setup guide for bring-your-own-key AI (JEF-231)', () => {
    render(<SettingsAiPage />, { wrapper: Wrapper });

    expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
      'href',
      '/ai-mcp-setup',
    );
  });

  it("shows an existing key's provider and default badge", async () => {
    mockGqlRequest.mockResolvedValue({
      llmApiKeys: [{ provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null }],
      me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
    });
    render(<SettingsAiPage />, { wrapper: Wrapper });

    // "OpenRouter" alone would also match the (still-present) dropdown option
    // before the list loads, so wait for the loaded row itself.
    const row = await screen.findByTestId('llm-provider-row-openrouter');
    expect(row).toHaveTextContent('OpenRouter');
    expect(row).toHaveTextContent('Default');
  });

  describe('testing a saved key (JEF-247)', () => {
    beforeEach(() => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [
              { provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null },
            ],
            me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
          });
        }
        return Promise.resolve({ testLlmApiKey: { ok: true, error: null } });
      });
    });

    it('tests the saved key by provider, without sending an apiKey', async () => {
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const row = await screen.findByTestId('llm-provider-row-openrouter');

      await chooseRowAction(user, row, 'Test');

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('testLlmApiKey'), {
          provider: 'openrouter',
        });
      });
    });

    it('shows a success message after a successful test', async () => {
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const row = await screen.findByTestId('llm-provider-row-openrouter');

      await chooseRowAction(user, row, 'Test');

      expect(await within(row).findByText('Connection works.')).toBeInTheDocument();
    });

    it('shows the failure message after a failed test', async () => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [
              { provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null },
            ],
            me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
          });
        }
        return Promise.resolve({
          testLlmApiKey: { ok: false, error: 'Invalid API key' },
        });
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const row = await screen.findByTestId('llm-provider-row-openrouter');

      await chooseRowAction(user, row, 'Test');

      expect(await within(row).findByText('Invalid API key')).toBeInTheDocument();
    });
  });

  describe('testing the add-key form before saving (JEF-247)', () => {
    it('disables the Test button until an API key is entered', async () => {
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await screen.findByPlaceholderText('sk-…');

      const testButton = screen.getByRole('button', { name: 'Test' });
      expect(testButton).toBeDisabled();

      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText('sk-…'), 'sk-123');

      expect(testButton).toBeEnabled();
    });

    it('tests the unsaved form values without persisting anything', async () => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [],
            me: { defaultLlmProvider: null, customAiPrompt: null },
          });
        }
        return Promise.resolve({ testLlmApiKey: { ok: true, error: null } });
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await screen.findByPlaceholderText('sk-…');

      await user.type(screen.getByPlaceholderText('sk-…'), 'sk-123');
      await user.click(screen.getByRole('button', { name: 'Test' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('testLlmApiKey'), {
          provider: 'openrouter',
          apiKey: 'sk-123',
          model: undefined,
          baseUrl: undefined,
        });
      });
      expect(mockGqlRequest).not.toHaveBeenCalledWith(
        expect.stringContaining('saveLlmApiKey'),
        expect.anything(),
      );
      expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    });

    it('keeps the Test button disabled for a custom provider until baseUrl and model are also filled in', async () => {
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await screen.findByPlaceholderText('sk-…');

      await user.selectOptions(screen.getByRole('combobox'), 'custom');
      await user.type(screen.getByPlaceholderText('sk-…'), 'sk-123');

      const testButton = screen.getByRole('button', { name: 'Test' });
      expect(testButton).toBeDisabled();

      await user.type(
        screen.getByPlaceholderText('https://your-endpoint.example.com/v1/chat/completions'),
        'https://my-llm.example.com',
      );
      expect(testButton).toBeDisabled();

      await user.type(screen.getByPlaceholderText('e.g. gpt-4o-mini'), 'my-model');
      expect(testButton).toBeEnabled();
    });
  });

  describe('progressive disclosure of the add-provider form (redesign)', () => {
    it('opens the form automatically when no provider is configured yet', async () => {
      render(<SettingsAiPage />, { wrapper: Wrapper });

      expect(await screen.findByPlaceholderText('sk-…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add provider' })).not.toBeInTheDocument();
    });

    it('collapses the form behind an "Add provider" button once a key exists, and expands it on click', async () => {
      mockGqlRequest.mockResolvedValue({
        llmApiKeys: [
          { provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null },
        ],
        me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await screen.findByTestId('llm-provider-row-openrouter');

      expect(screen.queryByPlaceholderText('sk-…')).not.toBeInTheDocument();
      const addProviderButton = screen.getByRole('button', { name: 'Add provider' });

      await user.click(addProviderButton);

      expect(screen.getByPlaceholderText('sk-…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add provider' })).not.toBeInTheDocument();
    });

    it('collapses the form again via Cancel, discarding what was typed', async () => {
      mockGqlRequest.mockResolvedValue({
        llmApiKeys: [
          { provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null },
        ],
        me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await screen.findByTestId('llm-provider-row-openrouter');

      await user.click(screen.getByRole('button', { name: 'Add provider' }));
      await user.type(screen.getByPlaceholderText('sk-…'), 'sk-123');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByPlaceholderText('sk-…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add provider' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Add provider' }));
      expect(screen.getByPlaceholderText('sk-…')).toHaveValue('');
    });

    it('collapses the form again after a successful save', async () => {
      let saved = false;
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: saved ? [{ provider: 'openrouter', model: null, baseUrl: null }] : [],
            me: { defaultLlmProvider: saved ? 'openrouter' : null, customAiPrompt: null },
          });
        }
        if (document.includes('saveLlmApiKey')) {
          saved = true;
          return Promise.resolve({ saveLlmApiKey: true });
        }
        return Promise.resolve({});
      });
      const user = userEvent.setup();
      render(<SettingsAiPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByPlaceholderText('sk-…')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('sk-…'), 'sk-123');
      await user.click(screen.getByRole('button', { name: 'Add key' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add provider' })).toBeInTheDocument();
      });
    });
  });

  describe('usage summary (JEF-250)', () => {
    beforeEach(() => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [
              { provider: 'openrouter', model: null, baseUrl: null, monthlyTokenLimit: null },
            ],
            me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
          });
        }
        if (document.includes('query LlmUsageSummary')) {
          return Promise.resolve({
            llmUsageSummary: [
              {
                provider: 'openrouter',
                requestCount: 3,
                promptTokens: 100,
                completionTokens: 40,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                lastUsedAt: '2026-01-01T00:00:00.000Z',
                monthlyTokenLimit: null,
                limitReached: false,
              },
            ],
          });
        }
        return Promise.resolve({});
      });
    });

    it("shows the provider's request count and token count for the current month", async () => {
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const row = await screen.findByTestId('llm-provider-row-openrouter');

      expect(await within(row).findByText(/This month/)).toBeInTheDocument();
      expect(within(row).getByText(/3 requests/)).toBeInTheDocument();
      expect(within(row).getByText(/140 tokens/)).toBeInTheDocument();
    });

    it('shows nothing for a provider with no recorded usage yet', async () => {
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [{ provider: 'anthropic', model: null, baseUrl: null }],
            me: { defaultLlmProvider: 'anthropic', customAiPrompt: null },
          });
        }
        if (document.includes('query LlmUsageSummary')) {
          return Promise.resolve({ llmUsageSummary: [] });
        }
        return Promise.resolve({});
      });
      render(<SettingsAiPage />, { wrapper: Wrapper });
      const row = await screen.findByTestId('llm-provider-row-anthropic');

      expect(within(row).queryByText(/requests/)).not.toBeInTheDocument();
    });
  });

  describe('monthly token limits (JEF-258)', () => {
    const respond = (
      key: { monthlyTokenLimit: number | null },
      usage: {
        promptTokens: number;
        completionTokens: number;
        limitReached: boolean;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      } | null,
    ) =>
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [
              {
                provider: 'openrouter',
                model: null,
                baseUrl: null,
                monthlyTokenLimit: key.monthlyTokenLimit,
              },
            ],
            me: { defaultLlmProvider: 'openrouter', customAiPrompt: null },
          });
        }
        if (document.includes('query LlmUsageSummary')) {
          return Promise.resolve({
            llmUsageSummary: usage
              ? [
                  {
                    provider: 'openrouter',
                    requestCount: 3,
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    cacheReadTokens: usage.cacheReadTokens ?? 0,
                    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
                    lastUsedAt: '2026-01-01T00:00:00.000Z',
                    monthlyTokenLimit: key.monthlyTokenLimit,
                    limitReached: usage.limitReached,
                  },
                ]
              : [],
          });
        }
        return Promise.resolve({});
      });

    const row = () => screen.findByTestId('llm-provider-row-openrouter');

    it('shows no meter for a key with no limit', async () => {
      respond(
        { monthlyTokenLimit: null },
        { promptTokens: 100, completionTokens: 40, limitReached: false },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await within(el).findByText(/This month/);
      expect(within(el).queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('meters usage against the limit when one is set', async () => {
      respond(
        { monthlyTokenLimit: 2_000_000 },
        { promptTokens: 1_000_000, completionTokens: 240_000, limitReached: false },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      const meter = await within(el).findByRole('progressbar');
      expect(meter).toHaveAttribute('aria-valuenow', '1240000');
      expect(meter).toHaveAttribute('aria-valuemax', '2000000');
      expect(within(el).getByText(/1,240,000 of 2,000,000 tokens/)).toBeInTheDocument();
    });

    it('shows the prompt-cache hit rate when the provider reports one (F12)', async () => {
      respond(
        { monthlyTokenLimit: null },
        {
          promptTokens: 1000,
          completionTokens: 40,
          limitReached: false,
          cacheReadTokens: 680,
          cacheWriteTokens: 100,
        },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      expect(await within(el).findByText(/68% cache hits/)).toBeInTheDocument();
    });

    it('says nothing about caching for a provider that never reports a split', async () => {
      respond(
        { monthlyTokenLimit: null },
        { promptTokens: 1000, completionTokens: 40, limitReached: false },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await within(el).findByText(/This month/);
      expect(within(el).queryByText(/cache hits/)).not.toBeInTheDocument();
    });

    /** The request count and last-used date survive the meter arriving. */
    it('keeps the request count and last-used date alongside the meter', async () => {
      respond(
        { monthlyTokenLimit: 2_000_000 },
        { promptTokens: 100, completionTokens: 40, limitReached: false },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      expect(await within(el).findByText(/3 requests/)).toBeInTheDocument();
      expect(within(el).getByText(/last used/)).toBeInTheDocument();
    });

    it('marks a key at its limit as paused, with a way back', async () => {
      respond(
        { monthlyTokenLimit: 2_000_000 },
        { promptTokens: 2_000_000, completionTokens: 0, limitReached: true },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      expect(await within(el).findByText('Paused')).toBeInTheDocument();
      expect(within(el).getByText(/Monthly limit reached/)).toBeInTheDocument();
      expect(within(el).getByRole('button', { name: 'Raise limit' })).toBeInTheDocument();
    });

    it('offers to set a limit when there is none, and to edit one when there is', async () => {
      const user = userEvent.setup();
      respond({ monthlyTokenLimit: null }, null);
      const { unmount } = render(<SettingsAiPage />, { wrapper: Wrapper });

      let el = await row();
      await user.click(within(el).getByRole('button', { name: 'Key actions' }));
      expect(screen.getByRole('menuitem', { name: 'Set limit' })).toBeInTheDocument();
      unmount();

      respond({ monthlyTokenLimit: 500_000 }, null);
      render(<SettingsAiPage />, { wrapper: Wrapper });
      el = await row();
      await user.click(within(el).getByRole('button', { name: 'Key actions' }));
      expect(screen.getByRole('menuitem', { name: 'Edit monthly limit' })).toBeInTheDocument();
    });

    it('saves a limit and refreshes both queries', async () => {
      const user = userEvent.setup();
      respond({ monthlyTokenLimit: null }, null);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await chooseRowAction(user, el, 'Set limit');
      await user.type(within(el).getByLabelText('Monthly token limit'), '250000');
      await user.click(within(el).getByRole('button', { name: 'Save limit' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('setLlmApiKeyMonthlyLimit'),
          { provider: 'openrouter', monthlyTokenLimit: 250000 },
        );
      });
    });

    it('clears the limit when the No limit preset is used', async () => {
      const user = userEvent.setup();
      respond({ monthlyTokenLimit: 500_000 }, null);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await chooseRowAction(user, el, 'Edit monthly limit');
      await user.click(within(el).getByRole('button', { name: 'No limit' }));
      await user.click(within(el).getByRole('button', { name: 'Save limit' }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('setLlmApiKeyMonthlyLimit'),
          { provider: 'openrouter', monthlyTokenLimit: null },
        );
      });
    });

    it('refuses a value that is not a whole number of tokens', async () => {
      const user = userEvent.setup();
      respond({ monthlyTokenLimit: null }, null);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await chooseRowAction(user, el, 'Set limit');
      await user.type(within(el).getByLabelText('Monthly token limit'), 'lots');
      await user.click(within(el).getByRole('button', { name: 'Save limit' }));

      expect(await within(el).findByText(/whole number of tokens/)).toBeInTheDocument();
      expect(mockGqlRequest).not.toHaveBeenCalledWith(
        expect.stringContaining('setLlmApiKeyMonthlyLimit'),
        expect.anything(),
      );
    });

    it('labels the save action as resuming when the key is already at its limit', async () => {
      const user = userEvent.setup();
      respond(
        { monthlyTokenLimit: 2_000_000 },
        { promptTokens: 2_000_000, completionTokens: 0, limitReached: true },
      );
      render(<SettingsAiPage />, { wrapper: Wrapper });

      const el = await row();
      await user.click(await within(el).findByRole('button', { name: 'Raise limit' }));

      expect(within(el).getByRole('button', { name: 'Raise limit & resume' })).toBeInTheDocument();
    });
  });

  describe('fallback when a key hits its limit (JEF-258)', () => {
    const withSetting = (llmFallbackWhenLimited: boolean) =>
      mockGqlRequest.mockImplementation((document: string) => {
        if (document.includes('query LlmApiKeys')) {
          return Promise.resolve({
            llmApiKeys: [],
            me: {
              defaultLlmProvider: null,
              customAiPrompt: null,
              useCrossApplicationContext: false,
              llmFallbackWhenLimited,
            },
          });
        }
        return Promise.resolve({});
      });

    const toggle = () =>
      screen.findByRole('checkbox', { name: 'Use another key when one hits its limit' });

    it('is off by default', async () => {
      withSetting(false);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      expect(await toggle()).not.toBeChecked();
    });

    it('reflects the saved setting when it is on', async () => {
      withSetting(true);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      // The checkbox renders unchecked before the query lands, so the wait
      // has to be on the state rather than on the element existing.
      await waitFor(async () => expect(await toggle()).toBeChecked());
    });

    it('saves the setting when switched on', async () => {
      const user = userEvent.setup();
      withSetting(false);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      await user.click(await toggle());

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('updateProfile'), {
          llmFallbackWhenLimited: true,
        });
      });
    });

    it('explains what opting in costs', async () => {
      withSetting(false);
      render(<SettingsAiPage />, { wrapper: Wrapper });

      expect(
        await screen.findByText(/spends money on a provider you did not pick/),
      ).toBeInTheDocument();
    });
  });
});
