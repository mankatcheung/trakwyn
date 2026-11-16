import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { ThemeProvider } from '#/lib/theme';
import { AddLlmApiKeyForm } from '#/routes/_authenticated/settings/-components/AddLlmApiKeyForm';
import { StepUpPasswordForm } from '#/routes/_authenticated/settings/-components/StepUpPasswordForm';
import { LLM_PROVIDER_OPTIONS } from '#/routes/_authenticated/settings/-components/shared';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('AddLlmApiKeyForm as a form action (JEF-612)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves, clears the key and calls onSaved', async () => {
    mockGqlRequest.mockResolvedValue({});
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} onSaved={onSaved} />, {
      wrapper: Wrapper,
    });

    await user.type(document.querySelector('input[name="apiKey"]')!, 'sk-secret');
    await user.click(screen.getByRole('button', { name: 'Add key' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('saveLlmApiKey'),
      expect.objectContaining({ apiKey: 'sk-secret' }),
    );
    expect(document.querySelector<HTMLInputElement>('input[name="apiKey"]')!.value).toBe('');
  });

  it('shows the API error and keeps what was typed', async () => {
    mockGqlRequest.mockRejectedValue({
      response: { errors: [{ message: 'Key rejected by provider' }] },
    });
    const user = userEvent.setup();
    render(<AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} />, { wrapper: Wrapper });

    await user.type(document.querySelector('input[name="apiKey"]')!, 'sk-secret');
    await user.click(screen.getByRole('button', { name: 'Add key' }));

    expect(await screen.findByText('Key rejected by provider')).toBeInTheDocument();
    // React resets uncontrolled fields after an action; the form cancels that.
    expect(document.querySelector<HTMLInputElement>('input[name="apiKey"]')!.value).toBe(
      'sk-secret',
    );
  });

  it('does not call the API for an invalid form and keeps the other fields', async () => {
    const user = userEvent.setup();
    render(<AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} />, { wrapper: Wrapper });

    await user.selectOptions(screen.getByRole('combobox'), 'anthropic');
    await user.click(screen.getByRole('button', { name: 'Add key' }));

    await waitFor(() =>
      expect(document.querySelector('input[name="apiKey"]')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(mockGqlRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('anthropic');
  });

  it('is pending while saving and a double click saves once', async () => {
    const gate = deferred<unknown>();
    mockGqlRequest.mockReturnValue(gate.promise);
    const user = userEvent.setup();
    render(<AddLlmApiKeyForm providerOptions={LLM_PROVIDER_OPTIONS} />, { wrapper: Wrapper });

    await user.type(document.querySelector('input[name="apiKey"]')!, 'sk-secret');
    await user.dblClick(screen.getByRole('button', { name: 'Add key' }));

    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy).toBeDisabled();
    gate.resolve({});

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add key' })).toBeEnabled());
    expect(mockGqlRequest).toHaveBeenCalledTimes(1);
  });
});

describe('StepUpPasswordForm as a form action (JEF-612)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms the password and calls onSuccess', async () => {
    mockGqlRequest.mockResolvedValue({
      reauthenticate: { success: true, totpRequired: false },
    });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<StepUpPasswordForm onSuccess={onSuccess} onCancel={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await user.type(screen.getByPlaceholderText('••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('reauthenticate'), {
      password: 'hunter2',
      code: undefined,
    });
  });

  it('asks for the two-factor code and keeps the password when it is required', async () => {
    mockGqlRequest.mockResolvedValue({
      reauthenticate: { success: false, totpRequired: true },
    });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<StepUpPasswordForm onSuccess={onSuccess} onCancel={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await user.type(screen.getByPlaceholderText('••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByPlaceholderText('123456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify code' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toHaveValue('hunter2');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the failure message', async () => {
    mockGqlRequest.mockRejectedValue({ response: { errors: [{ message: 'Wrong password' }] } });
    const user = userEvent.setup();
    render(<StepUpPasswordForm onSuccess={vi.fn()} onCancel={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await user.type(screen.getByPlaceholderText('••••••••'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
  });

  it('shows Verifying… while pending and a double click verifies once', async () => {
    const gate = deferred<unknown>();
    mockGqlRequest.mockReturnValue(gate.promise);
    const user = userEvent.setup();
    render(<StepUpPasswordForm onSuccess={vi.fn()} onCancel={vi.fn()} />, {
      wrapper: Wrapper,
    });

    await user.type(screen.getByPlaceholderText('••••••••'), 'hunter2');
    await user.dblClick(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('button', { name: 'Verifying…' })).toBeDisabled();
    gate.resolve({ reauthenticate: { success: true, totpRequired: false } });

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(1));
  });
});
