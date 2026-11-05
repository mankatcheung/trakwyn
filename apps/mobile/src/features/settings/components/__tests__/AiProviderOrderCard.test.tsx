import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { AiProviderOrderCard } from '../AiProviderOrderCard';
import type { LlmApiKey } from '../../types';

const key = (provider: string): LlmApiKey => ({
  provider,
  model: null,
  baseUrl: null,
  monthlyTokenLimit: null,
});

async function card(overrides: Partial<React.ComponentProps<typeof AiProviderOrderCard>> = {}) {
  const onChange = jest.fn();
  const utils = await render(
    <AiProviderOrderCard
      order={['openai', 'anthropic']}
      keys={[key('openai'), key('anthropic')]}
      hostedAi={false}
      pending={false}
      error={null}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

describe('AiProviderOrderCard (JEF-503)', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('shows each provider with where its messages go', async () => {
    const { getByTestId, getByText } = await card();

    expect(getByTestId('ai-order-openai')).toBeTruthy();
    expect(getByTestId('ai-order-anthropic')).toBeTruthy();
    expect(getByText('Uses your OpenAI key. Your messages go to OpenAI.')).toBeTruthy();
    expect(getByText('Uses your Anthropic key. Your messages go to Anthropic.')).toBeTruthy();
  });

  it('explains what Trakwyn AI uses', async () => {
    const { getByText } = await card({ order: ['trakwyn'], hostedAi: true, keys: [] });

    expect(getByText(/Uses your monthly credits/)).toBeTruthy();
  });

  it('saves the whole list when a provider is moved down', async () => {
    const { getByTestId, onChange } = await card();

    await fireEvent.press(getByTestId('ai-order-down-openai'));

    expect(onChange).toHaveBeenCalledWith(['anthropic', 'openai']);
  });

  it('cannot move the first up or the last down', async () => {
    const { getByTestId, onChange } = await card();

    await fireEvent.press(getByTestId('ai-order-up-openai'));
    await fireEvent.press(getByTestId('ai-order-down-anthropic'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes a provider out of the list', async () => {
    const { getByTestId, onChange } = await card();

    await fireEvent.press(getByTestId('ai-order-remove-anthropic'));

    expect(onChange).toHaveBeenCalledWith(['openai']);
  });

  it('keeps at least one provider, and says there is no fallback when only one is listed', async () => {
    const { getByTestId, onChange } = await card({ order: ['openai'] });

    await fireEvent.press(getByTestId('ai-order-remove-openai'));

    expect(onChange).not.toHaveBeenCalled();
    expect(getByTestId('ai-order-only-one')).toBeTruthy();
  });

  it('offers a saved key that is not listed, and adds it at the end', async () => {
    const { getByTestId, onChange } = await card({ order: ['openai'] });

    await fireEvent.press(getByTestId('ai-order-add-anthropic'));

    expect(onChange).toHaveBeenCalledWith(['openai', 'anthropic']);
  });

  it('does not offer Trakwyn AI on a plan without it', async () => {
    const { queryByTestId } = await card({
      order: ['openai'],
      keys: [key('openai')],
      hostedAi: false,
    });

    expect(queryByTestId('ai-order-add-trakwyn')).toBeNull();
  });

  it('offers Trakwyn AI on a plan that has it, and adds it at the end', async () => {
    const { getByTestId, onChange } = await card({
      order: ['openai'],
      keys: [key('openai')],
      hostedAi: true,
    });

    await fireEvent.press(getByTestId('ai-order-add-trakwyn'));

    expect(onChange).toHaveBeenCalledWith(['openai', 'trakwyn']);
  });

  it('does nothing while a save is in flight', async () => {
    const { getByTestId, onChange } = await card({ pending: true });

    await fireEvent.press(getByTestId('ai-order-down-openai'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when nothing is listed', async () => {
    const { getByTestId } = await card({ order: [], keys: [] });

    expect(getByTestId('ai-order-empty')).toBeTruthy();
  });

  it('shows the error from a failed save', async () => {
    const { getByText } = await card({ error: 'Could not save the order.' });

    expect(getByText('Could not save the order.')).toBeTruthy();
  });
});
