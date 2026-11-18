import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { AiKeyStep } from '#/features/onboarding/components/welcome/AiKeyStep';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/features/settings/components/ai/AddLlmApiKeyForm', () => ({
  AddLlmApiKeyForm: () => <div data-testid="add-key-form" />,
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AiKeyStep />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiKeyStep', () => {
  it('holds a placeholder while the keys load', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    setup();

    expect(screen.queryByTestId('add-key-form')).not.toBeInTheDocument();
    expect(screen.queryByText('Your AI key is connected.')).not.toBeInTheDocument();
  });

  it('shows the add-key form when no key is saved', async () => {
    mockGqlRequest.mockResolvedValue({ llmApiKeys: [], me: { defaultLlmProvider: null } });
    setup();

    expect(await screen.findByTestId('add-key-form')).toBeInTheDocument();
  });

  it('says the key is connected once one is saved', async () => {
    mockGqlRequest.mockResolvedValue({
      llmApiKeys: [{ id: 'k1', provider: 'openai' }],
      me: { defaultLlmProvider: 'openai' },
    });
    setup();

    expect(await screen.findByText('Your AI key is connected.')).toBeInTheDocument();
    expect(screen.queryByTestId('add-key-form')).not.toBeInTheDocument();
  });

  it('moves from the form to the confirmation when a key is saved', async () => {
    mockGqlRequest.mockResolvedValue({ llmApiKeys: [], me: { defaultLlmProvider: null } });
    const view = setup();
    await screen.findByTestId('add-key-form');

    await act(async () => {
      view.client.setQueryData(['llmApiKeys'], {
        llmApiKeys: [{ id: 'k1', provider: 'openai' }],
        me: { defaultLlmProvider: 'openai' },
      });
    });

    expect(await screen.findByText('Your AI key is connected.')).toBeInTheDocument();
    expect(screen.queryByTestId('add-key-form')).not.toBeInTheDocument();
  });

  it('rewords the confirmation when the language changes', async () => {
    mockGqlRequest.mockResolvedValue({
      llmApiKeys: [{ id: 'k1', provider: 'openai' }],
      me: { defaultLlmProvider: 'openai' },
    });
    setup();
    await screen.findByText('Your AI key is connected.');
    i18next.addResourceBundle('en-GB', 'translation', {
      'welcome.aiKeyDone': 'Your AI key is linked.',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByText('Your AI key is linked.')).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByText('Your AI key is connected.')).toBeInTheDocument();
  });

  it('follows the keys as they are refreshed', async () => {
    mockGqlRequest.mockResolvedValue({ llmApiKeys: [], me: { defaultLlmProvider: null } });
    const view = setup();
    await screen.findByTestId('add-key-form');

    const withKey = {
      llmApiKeys: [{ id: 'k1', provider: 'openai' }],
      me: { defaultLlmProvider: 'openai' },
    };
    await act(async () => view.client.setQueryData(['llmApiKeys'], withKey));
    await screen.findByText('Your AI key is connected.');

    await act(async () => view.client.setQueryData(['llmApiKeys'], { ...withKey }));
    expect(screen.getByText('Your AI key is connected.')).toBeInTheDocument();

    await act(async () =>
      view.client.setQueryData(['llmApiKeys'], {
        llmApiKeys: [],
        me: { defaultLlmProvider: null },
      }),
    );
    expect(await screen.findByTestId('add-key-form')).toBeInTheDocument();
  });

  it('shows the form when the keys cannot be read', async () => {
    mockGqlRequest.mockRejectedValue(new Error('offline'));
    setup();

    expect(await screen.findByTestId('add-key-form')).toBeInTheDocument();
  });
});
