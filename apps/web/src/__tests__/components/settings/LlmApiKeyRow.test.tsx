import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { LlmApiKeyRow } from '#/routes/_authenticated/settings/-components/LlmApiKeyRow';
import type {
  LlmApiKey,
  LlmUsageSummary,
} from '#/routes/_authenticated/settings/-components/shared';

const key = (overrides: Partial<LlmApiKey> = {}): LlmApiKey => ({
  provider: 'openai',
  model: null,
  baseUrl: null,
  monthlyTokenLimit: 1_000_000,
  ...overrides,
});

const pausedUsage: LlmUsageSummary = {
  provider: 'openai',
  requestCount: 4,
  promptTokens: 900_000,
  completionTokens: 100_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  lastUsedAt: '2026-11-01T00:00:00.000Z',
  monthlyTokenLimit: 1_000_000,
  limitReached: true,
};

let client: QueryClient;

/** A paused key shows "Raise limit", which opens the editor without the menu. */
function renderEditor(llmApiKey: LlmApiKey = key()) {
  render(
    <QueryClientProvider client={client}>
      <LlmApiKeyRow llmApiKey={llmApiKey} usage={pausedUsage} onTest={vi.fn()} onRemove={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^raise limit$/i }));
  return screen.getByRole('textbox') as HTMLInputElement;
}

const saveButton = () => screen.getByRole('button', { name: /raise limit & resume/i });
const limitCalls = () =>
  mockGqlRequest.mock.calls.filter(([query]) => String(query).includes('SetLlmApiKeyMonthlyLimit'));

describe('LlmApiKeyRow limit editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGqlRequest.mockResolvedValue({ setLlmApiKeyMonthlyLimit: true });
  });

  it('saves the typed number for this provider and closes the editor', async () => {
    const input = renderEditor();
    expect(input).toHaveValue('1000000');

    fireEvent.change(input, { target: { value: '2,000,000' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(limitCalls()[0][1]).toEqual({ provider: 'openai', monthlyTokenLimit: 2_000_000 });
  });

  it('refetches the keys and the usage once it is saved', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const input = renderEditor();

    fireEvent.change(input, { target: { value: '5000000' } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys).toContainEqual(['llmApiKeys']);
      expect(keys).toContainEqual(['llmUsageSummary']);
    });
  });

  it('sends no limit for an empty field, and a preset fills the field', async () => {
    const input = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: '500,000' }));
    expect(input).toHaveValue('500000');

    fireEvent.click(screen.getByRole('button', { name: /^no limit$/i }));
    expect(input).toHaveValue('');
    fireEvent.click(saveButton());

    await waitFor(() => expect(limitCalls()).toHaveLength(1));
    expect(limitCalls()[0][1]).toEqual({ provider: 'openai', monthlyTokenLimit: null });
  });

  it('rejects text and zero without calling the API', async () => {
    const input = renderEditor();

    fireEvent.change(input, { target: { value: '12abc' } });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText(/whole number of tokens/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    // The button stays disabled until the first submit settles.
    await waitFor(() => expect(saveButton()).toBeEnabled());

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(saveButton());
    expect(await screen.findByText(/at least 1 token/i, {}, { timeout: 3000 })).toBeInTheDocument();

    expect(limitCalls()).toHaveLength(0);
  });

  it('keeps the editor and the typed value when the save fails', async () => {
    mockGqlRequest.mockRejectedValue(new Error('boom'));
    const input = renderEditor();

    fireEvent.change(input, { target: { value: '3000000' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText('Could not update the limit.')).toBeInTheDocument();
    expect(input).toHaveValue('3000000');
  });

  it('saves once on a double click', async () => {
    let release: (value: unknown) => void = () => {};
    mockGqlRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const input = renderEditor();
    fireEvent.change(input, { target: { value: '3000000' } });

    const save = saveButton();
    fireEvent.click(save);
    await waitFor(() => expect(limitCalls()).toHaveLength(1));
    fireEvent.click(save);
    release({ setLlmApiKeyMonthlyLimit: true });

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(limitCalls()).toHaveLength(1);
  });

  it('closes without saving on cancel', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(limitCalls()).toHaveLength(0);
  });
});
