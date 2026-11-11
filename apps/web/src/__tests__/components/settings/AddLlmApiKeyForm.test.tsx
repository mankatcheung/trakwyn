import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: vi.fn() },
}));

import { ThemeProvider } from '#/lib/theme';
import { AddLlmApiKeyForm } from '#/routes/_authenticated/settings/-components/AddLlmApiKeyForm';
import {
  LLM_PROVIDER_DATA_USE_URL,
  LLM_PROVIDER_OPTIONS,
  llmProviderDataUseUrl,
} from '#/routes/_authenticated/settings/-components/shared';

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('AddLlmApiKeyForm data-use link (JEF-549)', () => {
  it('has an https data-use URL for every named provider and none for custom', () => {
    for (const { value } of LLM_PROVIDER_OPTIONS) {
      if (value === 'custom') {
        expect(llmProviderDataUseUrl(value)).toBeNull();
      } else {
        expect(llmProviderDataUseUrl(value)).toMatch(/^https:\/\//);
      }
    }
  });

  it('lists no provider outside the form, and every entry is https', () => {
    for (const [provider, url] of Object.entries(LLM_PROVIDER_DATA_USE_URL)) {
      expect(LLM_PROVIDER_OPTIONS.some((o) => o.value === provider)).toBe(true);
      expect(new URL(url).protocol).toBe('https:');
    }
  });

  it('shows the selected provider’s link, opening in a new tab', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByRole('combobox'), 'anthropic');

    const link = screen.getByRole('link', { name: /How Anthropic \(Claude\) handles your data/ });
    expect(link).toHaveAttribute('href', LLM_PROVIDER_DATA_USE_URL.anthropic);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows a hint instead of a link for a custom endpoint', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByRole('combobox'), 'custom');

    expect(screen.queryByRole('link', { name: /handles your data/ })).toBeNull();
    expect(screen.getByText(/company running your endpoint decides/i)).toBeInTheDocument();
  });

  it('refuses a URL that is not https', () => {
    LLM_PROVIDER_DATA_USE_URL.__test = 'http://example.com/policy';
    try {
      expect(llmProviderDataUseUrl('__test')).toBeNull();
    } finally {
      delete LLM_PROVIDER_DATA_USE_URL.__test;
    }
  });
});
