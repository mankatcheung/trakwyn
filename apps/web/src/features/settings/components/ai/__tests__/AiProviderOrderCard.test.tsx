import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import i18next from 'i18next';
import { AiProviderOrderCard } from '#/features/settings/components/ai/AiProviderOrderCard';
import type { LlmApiKey } from '#/features/settings/lib/ai/aiTypes';
import { LLM_PROVIDER_LABEL } from '#/features/settings/lib/ai/llmProviders';

vi.mock('#/features/ai/components/AiCreditsMeter', () => ({
  AiCreditsMeter: () => <div data-testid="credits-meter" />,
}));

const key = (provider: string): LlmApiKey => ({
  provider,
  model: null,
  baseUrl: null,
  monthlyTokenLimit: null,
});

const openai = LLM_PROVIDER_LABEL['openai'];
const anthropic = LLM_PROVIDER_LABEL['anthropic'];

function setup(props: Partial<Parameters<typeof AiProviderOrderCard>[0]> = {}) {
  const onChange = vi.fn();
  const view = render(
    <AiProviderOrderCard
      order={['openai', 'anthropic']}
      keys={[key('openai'), key('anthropic')]}
      hostedAi={false}
      busy={false}
      error={null}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, ...view };
}

describe('AiProviderOrderCard', () => {
  it('lists the providers in the order they are tried, numbered', () => {
    setup();

    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.testid);
    expect(rows.map((r) => r.dataset.testid)).toEqual(['ai-order-openai', 'ai-order-anthropic']);
    expect(within(rows[0]).getByText('1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2')).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(`Uses your ${openai} key. Your messages go to ${openai}.`),
    ).toBeInTheDocument();
  });

  it('names a provider it has no label or avatar for by its id', () => {
    setup({ order: ['mystery'], keys: [key('mystery')] });

    const row = screen.getByTestId('ai-order-mystery');
    expect(within(row).getByText('mystery', { selector: 'p' })).toBeInTheDocument();
    expect(row.querySelector('.rounded-lg.font-bold')).toBeNull();
  });

  it('follows the order, the keys and the busy state as they change', () => {
    const onChange = vi.fn();
    const props = {
      keys: [key('openai'), key('anthropic')],
      hostedAi: false,
      error: null,
      onChange,
    };
    const { rerender } = render(<AiProviderOrderCard order={['openai']} busy={false} {...props} />);
    rerender(<AiProviderOrderCard order={['openai']} busy={false} {...props} />);
    expect(screen.getByText(/no fallback/)).toBeInTheDocument();

    rerender(<AiProviderOrderCard order={['openai', 'anthropic']} busy {...props} />);
    expect(screen.queryByText(/no fallback/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Move ${anthropic} up` })).toBeDisabled();

    rerender(<AiProviderOrderCard order={['anthropic', 'openai']} busy={false} {...props} />);
    expect(screen.getByRole('button', { name: `Move ${openai} up` })).toBeEnabled();
    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.testid);
    expect(rows.map((r) => r.dataset.testid)).toEqual(['ai-order-anthropic', 'ai-order-openai']);

    rerender(
      <AiProviderOrderCard order={['anthropic', 'openai']} busy={false} {...props} error="Boom" />,
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('rewords itself when the language changes', async () => {
    setup();
    i18next.addResourceBundle('en-GB', 'translation', { 'aiOrder.title': 'Which AI replies' });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByRole('heading', { name: 'Which AI replies' })).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByRole('heading', { name: 'Which AI answers' })).toBeInTheDocument();
  });

  it('says AI is off when nothing is listed', () => {
    setup({ order: [], keys: [] });

    expect(screen.getByText(/AI features are off/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the hosted entry with its own note and no avatar', () => {
    setup({ order: ['trakwyn', 'openai'], keys: [key('openai')], hostedAi: true });

    const row = screen.getByTestId('ai-order-trakwyn');
    expect(within(row).getByText('Trakwyn AI')).toBeInTheDocument();
    expect(within(row).getByText(/Included with Pro/)).toBeInTheDocument();
  });

  it('shows the credits meter only on a plan with hosted AI', () => {
    const { unmount } = setup({ hostedAi: true });
    expect(screen.getByTestId('credits-meter')).toBeInTheDocument();
    unmount();

    setup({ hostedAi: null });
    expect(screen.queryByTestId('credits-meter')).not.toBeInTheDocument();
  });

  it('moves a provider up and down', () => {
    const { onChange } = setup();

    fireEvent.click(screen.getByRole('button', { name: `Move ${anthropic} up` }));
    expect(onChange).toHaveBeenLastCalledWith(['anthropic', 'openai']);

    fireEvent.click(screen.getByRole('button', { name: `Move ${openai} down` }));
    expect(onChange).toHaveBeenLastCalledWith(['anthropic', 'openai']);
  });

  it('cannot move the first up or the last down', () => {
    setup();

    expect(screen.getByRole('button', { name: `Move ${openai} up` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Move ${anthropic} down` })).toBeDisabled();
  });

  it('removes a provider', () => {
    const { onChange } = setup();

    fireEvent.click(screen.getByRole('button', { name: `Stop using ${openai}` }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['anthropic']);
  });

  it('will not remove the last provider', () => {
    setup({ order: ['openai'], keys: [key('openai')] });

    expect(screen.getByRole('button', { name: `Stop using ${openai}` })).toBeDisabled();
  });

  it('offers what is not listed, and adds it at the end', () => {
    const { onChange } = setup({
      order: ['openai'],
      keys: [key('openai'), key('anthropic')],
      hostedAi: true,
    });

    expect(screen.getByText('Not in the list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Add ${anthropic}` }));
    expect(onChange).toHaveBeenLastCalledWith(['openai', 'anthropic']);

    fireEvent.click(screen.getByRole('button', { name: 'Add Trakwyn AI' }));
    expect(onChange).toHaveBeenLastCalledWith(['openai', 'trakwyn']);
  });

  it('warns there is no fallback when one provider is listed and others could be', () => {
    setup({ order: ['openai'], keys: [key('openai'), key('anthropic')] });

    expect(screen.getByText(/no fallback if it fails/)).toBeInTheDocument();
  });

  it('offers nothing to add and no warning when everything is listed', () => {
    setup();

    expect(screen.queryByText('Not in the list')).not.toBeInTheDocument();
    expect(screen.queryByText(/no fallback/)).not.toBeInTheDocument();
  });

  it('disables every control while busy', () => {
    setup({ busy: true, order: ['openai'], keys: [key('openai'), key('anthropic')] });

    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('shows the error from the last save', () => {
    setup({ error: 'Could not save the order.' });

    expect(screen.getByText('Could not save the order.')).toBeInTheDocument();
  });
});
